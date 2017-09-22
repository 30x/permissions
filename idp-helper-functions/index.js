const lib = require('@apigee/http-helper-functions')
const rLib = require('@apigee/response-helper-functions')

const clientTokens = {}
const idCache = {}
const idCacheTTL = 300 * 1000
const emailToIdMap = {}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const clientIDRegex = /[a-z][a-z\-]*/
const emailRegex = /^[a-zA-Z0-9._%'+\\-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const issuerRegex =  /^https:\/\/(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/

const CLIENT_ID = process.env.PERMISSIONS_CLIENTID
const CLIENT_SECRET = process.env.PERMISSIONS_CLIENTSECRET

if (CLIENT_ID == null || CLIENT_SECRET == null)
  log('loading', 'misconfiguration — PERMISSIONS_CLIENTID and PERMISSIONS_CLIENTSECRET must be set')

function log(method, text) {
    console.log(Date.now(), process.env.COMPONENT_NAME, method, text)
  }  

function convertUsers(errorHandler, iss, path, inputArray, callback) {
  if (inputArray && inputArray.length > 0)
    lib.withValidClientToken(errorHandler, clientTokens[iss], CLIENT_ID, CLIENT_SECRET, iss+ '/oauth/token', function(token) {
      if (token)
        clientTokens[iss] = token
      else
        token = clientTokens[iss]
      var headers = {authorization: `Bearer ${token}`, 'content-type': 'application/json'}
      lib.sendExternalRequestThen(errorHandler, 'POST', iss + path, headers, inputArray, function(clientRes) {
        lib.getClientResponseBody(clientRes, function(body) {
          if (clientRes.statusCode == 200) {
            callback(JSON.parse(body))
          } else 
            rLib.internalError(errorHandler, {
              msg: 'unable to convert User ids/emails.', 
              statusCode: clientRes.statusCode, 
              body: JSON.parse(body)
            })
        })
      })
    })
}

function convertIDsToEmails(errorHandler, iss, idArray, callback) {
  convertUsers(errorHandler, iss, '/v2/ids/Users/ids/', idArray, callback)
}
function convertEmailsToIDs(errorHandler, iss, emailArray, callback) {
  convertUsers(errorHandler, iss, '/v2/ids/Users/emails/', emailArray, callback)
}

function verifyPrincipals(req, res, principals, callback) {
  let emails = {}
  let ids = {}
  for (let i = 0; i< principals.length; i++) {
    let principal = principals[i]
    if (!principal.startsWith('/az-tm-') && !getCachedPrincipal(principal)) {
      let parts = principal.split('#')
      if (parts[0] !== 'http://apigee.com/users')
        if (parts.length === 2 && parts[0].match(issuerRegex)) {
          let iss = parts[0]
          let id = parts[1]
          if (id.match(emailRegex))
            if (iss in emails)
              emails[iss].add(id)
            else
              emails[iss] = new Set([id])
          else if (id.match(uuidRegex))
            if (iss in ids)
              ids[iss].add(id)
            else
              ids[iss] = new Set([id])
          else if (!parts[0].match(clientIDRegex))
            return rLib.badRequest(res, {msg: `users and clients must be of the form {issuer}#{id} where id is an email address or a UUID. Examples are https://login.apigee.com#6ff95057-7b80-4f57-bfec-c23ec5609c77 and https://login.apigee.com#mnally@apigee.com. Value is ${principal}`})              
        } else
          return rLib.badRequest(res, {msg: `users and clients must be of the form {issuer}#{id} where id is an email address or a UUID. Examples are https://login.apigee.com#6ff95057-7b80-4f57-bfec-c23ec5609c77 and https://login.apigee.com#mnally@apigee.com. Value is ${principal}`})      
    }
  }
  let total = Object.keys(emails).length + Object.keys(ids).length
  if (total === 0)
    callback(emailToIdMap)
  else {
    let count = 0
    for (let iss in emails) {
      let emailArray = [...emails[iss]]
      convertEmailsToIDs(res, iss, emailArray, function(issIds) {
        if (emailArray.length === issIds.length)
          for (let i = 0; i < issIds.length; i++) {
            let principal = iss + '#' + issIds[i].id
            idCache[principal] = Date.now() + idCacheTTL
            emailToIdMap[iss + '#' + issIds[i].email] = iss + '#' + issIds[i].id
          }
        else
          return rLib.badRequest(res, {msg: 'invalid email IDs', ids: emailArray.filter(email => issIds.filter(entry => entry.email == email).length == 0)})
        if (++count === total)
          callback(emailToIdMap) 
      })
    }
    for (let iss in ids) {
      let idsArray = [...ids[iss]]
      convertIDsToEmails(res, iss, idsArray, function(issEmails) {
        if (idsArray.length !== issEmails.length)
          return rLib.badRequest(res, {msg: 'invalid principal IDs', ids: idsArray.filter(id => issEmails.filter(entry => entry.id == id).length == 0)})
        for (let i = 0; i < issEmails.length; i++) {
          let principal = iss + '#' + issEmails[i].id
          idCache[principal] = Date.now() + idCacheTTL
          emailToIdMap[iss + '#' + issEmails[i].email] = iss + '#' + issEmails[i].id
        }
        if (++count === total)
          callback(emailToIdMap)      
      })
    }
  }
}

function getCachedPrincipal(principal) {      
  let id = emailToIdMap[principal]
  if (id) {
    let ttl = idCache[id]
    if (ttl)
      if (ttl > Date.now())
        return id
      else {
        delete idCache[id]
        delete emailToIdMap[principal]
        return null
      }
    else {
      delete emailToIdMap[principal]
      return null
    }
  } else {
    let ttl = idCache[principal]
    if (ttl)
      if (ttl > Date.now())
        return id
      else {
        delete idCache[principal]
        return null
      }
    else
      return null
  }
}

exports.verifyPrincipals = verifyPrincipals