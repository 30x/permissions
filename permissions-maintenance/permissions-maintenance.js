'use strict'
/* 
We dislike prerequisites and avoid them where possible. 
We especially dislike prereqs that have a 'framework' style; simple libraries are more palatable.
Please do not add any framework to the preqs. We do not want express or anything like it. We do not want any sort of "ORM" or similar.
Adding simple library prereqs could be OK if the value they bring is in proportion to their size and complexity 
and is warranted by the difficulty of the problem being solved.
*/
const http = require('http')
const url = require('url')
const querystring = require('querystring')
const lib = require('http-helper-functions')
const pLib = require('permissions-helper-functions')
const rLib = require('response-helper-functions')
const db = require('./permissions-maintenance-db.js')

const INTERNAL_SCHEME = process.env.INTERNAL_SCHEME || 'http'
const ANYONE = 'http://apigee.com/users/anyone'
const INCOGNITO = 'http://apigee.com/users/incognito'
const SHIPYARD_PRIVATE_SECRET = process.env.SHIPYARD_PRIVATE_SECRET === undefined ? undefined : new Buffer(process.env.SHIPYARD_PRIVATE_SECRET).toString('base64')
const CLIENT_ID = process.env.PERMISSIONS_CLIENTID
const CLIENT_SECRET = process.env.PERMISSIONS_CLIENTSECRET
const clientTokens = {}

if (CLIENT_ID == null || CLIENT_SECRET == null)
  log('loading', 'misconfiguration — PERMISSIONS_CLIENTID and PERMISSIONS_CLIENTSECRET must be set')

function log(method, text) {
  console.log(Date.now(), process.env.COMPONENT_NAME, method, text)
}

function verifySharingSets(req, res, permissions, callback) {
  var sharingSets = permissions._inheritsPermissionsOf
  if (sharingSets == undefined || (Array.isArray(sharingSets) && sharingSets.length == 0))
    callback()
  else {
    if (!Array.isArray(sharingSets))
      permissions._inheritsPermissionsOf = sharingSets = [sharingSets]
    if (sharingSets.filter(ss => typeof ss != 'string').length > 0)
      rLib.badRequest(res, {msg: `values of _inheritsPermissionsOf must be URL strings`, body: permissions._inheritsPermissionsOf})
    else {
      sharingSets = sharingSets.map(x => lib.internalizeURL(x))
      var subject = lib.internalizeURL(permissions._subject)
      if (sharingSets.indexOf(subject) == -1) {
        var count = 0
        for (var i=0; i < sharingSets.length; i++) {
          var sharingSet = sharingSets[i]
          var allowedByAll = true
          pLib.withAllowedDo(lib.flowThroughHeaders(req), res, sharingSet, '_permissionsHeirs', 'add', function(allowed) {
            allowedByAll = allowedByAll && allowed
            if (++count == sharingSets.length) 
              if (allowedByAll)
                callback()
              else
                rLib.forbidden(res, {msg: `user ${user} is not allowed to inherit permissions from ${sharingSets}`})
          })
        }
      } else
        rLib.badRequest(res, {msg: `cannot inherit from self: ${subject} inheritsFrom: ${sharingSets}`})
    }
  }
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const clientIDRegex = /[a-z][a-z\-]*/
const emailRegex = /[a-zA-Z0-9._%'+\\-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/
const issuerRegex =  /^https:\/\/(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/

function convertUsers(errorHandler, iss, path, inputArray, callback) {
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
          rLib.internalError(errorHandler, `unable to convert User ids/emails. statusCode: ${clientRes.statusCode} body: ${body}`)
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
  var emails = {}
  var ids = {}
  for (let i = 0; i< principals.length; i++) {
    let principal = principals[i]
    if (!principal.startsWith('/az-tm-')) {
      let parts = principal.split('#')
      if (parts[0] != 'http://apigee.com/users')
        if (parts.length == 2 && parts[0].match(issuerRegex)) {
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
  var total = Object.keys(emails).length + Object.keys(ids).length
  if (total == 0)
    callback({})
  else {
    var count = 0
    var principalMap = {}
    for (let iss in emails) {
      let emailArray = [...emails[iss]]
      convertEmailsToIDs(res, iss, emailArray, function(issIds) {
        if (emailArray.length == issIds.length)
          for (let i = 0; i< issIds.length; i++)
            principalMap[iss + '#' + issIds[i].email] = iss + '#' + issIds[i].id
        else
          return rLib.badRequest(res, {msg: 'invalid email IDs', ids: emailArray.filter(email => issIds.filter(entry => entry.email == email).length == 0)})
        if (++count == total)
          callback(principalMap) 
      })
    }
    for (let iss in ids) {
      let idsArray = [...ids[iss]]
      convertIDsToEmails(res, iss, idsArray, function(issEmails) {
        console.log(iss, idsArray, issEmails)
        if (idsArray.length != issEmails.length)
          return rLib.badRequest(res, {msg: 'invalid principal IDs', ids: idsArray.filter(id => issEmails.filter(entry => entry.id == id).length == 0)})
        if (++count == total)
          callback(principalMap)      
      })
    }
  }
}

function verifyPropertyPrincipals(req, res, permissions, callback) {
  function iteratePrincipals(callback) {
    for (let propertyName in permissions)
      if (!propertyName.startsWith('_') || propertyName == '_self') {
        let propertyPermissions = permissions[propertyName]
        if (typeof propertyPermissions == 'object')
          for (let actionName in propertyPermissions) {
            let principals = propertyPermissions[actionName]
            if (Array.isArray(principals))
              for (let i = 0; i<principals.length; i++)
                callback(principals, i)
          }
      }    
  }
  var allPrincipals = []
  iteratePrincipals(function(principals, i) {
    allPrincipals.push(principals[i])
  })
  if (allPrincipals.length == 0)
    callback()
  else 
    verifyPrincipals(req, res, allPrincipals, function(principalMap) {
      iteratePrincipals(function (principals, i) {
        if (principals[i] in principalMap)
          principals[i] = principalMap[principals[i]]        
      })
      callback()
    })
}

function verifyPermissions(req, res, permissions, callback) {
  if (permissions._subject === undefined) 
    return rLib.badRequest(res, {msg: 'invalid JSON: "_subject" property not set'})
  if (typeof permissions._subject != 'string')
    return rLib.badRequest(res, {msg: 'invalid JSON: "_subject" must be string'})
  if (permissions._inheritsPermissionsOf !== undefined && !Array.isArray(permissions._inheritsPermissionsOf))
    if (typeof permissions._inheritsPermissionsOf == 'string')
      permissions._inheritsPermissionsOf = [permissions._inheritsPermissionsOf]
    else
      return rLib.badRequest(res, {msg: '_inheritsPermissionsOf must be a string or array'})
  var permissionsSelf = permissions._self
  var user = lib.getUser(req.headers.authorization)
  if (permissions._inheritsPermissionsOf === undefined) 
    if (permissionsSelf === undefined || permissionsSelf.govern === undefined)
      rLib.badRequest(res, `permissions for ${permissions._subject} must specify inheritance or at least one governor`)
    else
      if (permissionsSelf.admin === undefined)
        permissionsSelf.admin = permissionsSelf.govern
  verifyPropertyPrincipals(req, res, permissions, function() {
    verifySharingSets(req, res, permissions, function () {
      permissions._metadata = {}
      var rslt = lib.setStandardCreationProperties(req, permissions._metadata, user)
      if (rslt)
        rLib.badRequest(res, rslt)
      else {
        calculateSharedWith(req, permissions)
        addCalculatedProperties(req, permissions)
        callback()
      }
    })
  })
}

function calculateSharedWith(req, permissions) {
  function listUsers (obj, result) {
    for (var operation in obj) {
      var actors = obj[operation]
      if (actors !== undefined)
        for (var j = 0; j < actors.length; j++) 
          result[actors[j]] = true
    }
  }
  var result = {}
  if (permissions._self) 
    listUsers(permissions._self, result)
  permissions._metadata.sharedWith = Object.keys(result)
}

function createPermissions(req, res, permissions) {
  var hrstart = process.hrtime()
  log('createPermissions', `start subject: ${permissions._subject}`)
  function primCreate(req, res, permissions, scopes) {
    db.createPermissionsThen(req, res, permissions, scopes, function(etag) {
      var permissionsURL =  `${rLib.INTERNAL_URL_PREFIX}/az-permissions?${permissions._subject}`
      permissions.scopes = scopes
      rLib.created(res, permissions, req.headers.accept, permissionsURL, etag)
      var hrend = process.hrtime(hrstart)
      log('createPermissions', `success, time: ${hrend[0]}s ${hrend[1]/1000000}ms`)
    })        
  }
  var headers = lib.flowThroughHeaders(req)
  if (req.headers['x-client-authorization']) {
    headers.authorization = req.headers['x-client-authorization']
    pLib.ifAllowedThen(headers, res, '/', 'permissions', 'create', function() {
      verifyPermissions(req, res, permissions, () => {
        var ancestors = permissions._inheritsPermissionsOf
        if (ancestors)
          ifAllowedToInheritFromThen(req, res, null, ancestors, function(scopes) {
            primCreate(req, res, permissions, scopes)
          })
        else
          primCreate(req, res, permissions, [])
      })
    })
  } else
    rLib.unauthorized(res, {msg: 'must provide x-client-authorization header to create permissions'})
}

function addCalculatedProperties(req, permissions) {
}

function getPermissions(req, res, subject) {
  var hrstart = process.hrtime()
  subject = lib.internalizeURL(subject)
  log('getPermissions:', `start subject: ${subject}`)
  db.withPermissionsDo(req, res, subject, function(permissions, etag) {
    pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, subject, '_self', 'admin', function() {
      addCalculatedProperties(req, permissions)
      rLib.found(res, permissions, req.headers.accept, `/permsissions?${subject}`, etag)
      var hrend = process.hrtime(hrstart)
      log('getPermissions', `success, time: ${hrend[0]}s ${hrend[1]/1000000}ms`)
    })
  })  
}

function deletePermissions(req, res, subject) {
  var hrstart = process.hrtime()
  log('deletePermissions', `start subject: ${subject}`)
  pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, subject, '_self', 'govern', function() {
    db.deletePermissionsThen(req, res, subject, function(permissions, etag) {
      addCalculatedProperties(req, permissions)
      rLib.found(res, permissions, req.headers.accept, `/permsissions?${subject}`, etag)
      var hrend = process.hrtime(hrstart)
      log('deletePermissions', `success, time: ${hrend[0]}s ${hrend[1]/1000000}ms`)
    })
  })
}

function ifAllowedToInheritFromThen(req, res, subject, sharingSets, callback) {
  if (sharingSets.indexOf(subject) > -1)
    rLib.badRequest(res, 'may not inherit permissions from self')
  else {
    var queryParams = sharingSets.map(x => `sharingSet=${x}`)
    if (subject)
      queryParams.push(`subject=${subject}`)
    if (queryParams.length > 0) {
      var path = `/az-is-allowed-to-inherit-from?${queryParams.join('&')}`
      lib.sendInternalRequestThen(res, 'GET', path, lib.flowThroughHeaders(req), null, function(clientResponse) {
        lib.getClientResponseBody(clientResponse, function(body) {
          if (clientResponse.statusCode == 200) { 
            var result = JSON.parse(body)
            if (result.allowed == true)
              callback(result.scopes)
            else
              rLib.badRequest(res, `may not inherit from ${sharingSets}`)
          } else {
            var err = `ifAllowedToInheritFromThen: unable to retrieve ${path} statusCode ${clientResponse.statusCode} text: ${body}`
            log('ifAllowedToInheritFromThen', err)
            rLib.internalError(res, err)
          }
        })
      })
    } else
      callback([])
  }
}

function updatePermissions(req, res, subject, patch) {
  var hrstart = process.hrtime()
  log('updatePermissions', `start subject: ${subject}`)
  db.withPermissionsDo(req, res, subject, function(permissions, etag) {
    pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, subject, '_self', 'govern', function() {
      lib.applyPatch(req.headers, res, permissions, patch, function(patchedPermissions) {
        if (req.headers['if-match'] == etag) { 
          var new_permissions = '_inheritsPermissionsOf' in patchedPermissions ? patchedPermissions._inheritsPermissionsOf : []
          ifAllowedToInheritFromThen(req, res, subject, new_permissions, function(scopes) {
            verifyPermissions(req, res, patchedPermissions, function() {
              patchedPermissions._metadata.modifier = lib.getUser(req.headers.authorization)
              patchedPermissions._metadata.modified = new Date().toISOString()
              db.updatePermissionsThen(req, res, subject, patchedPermissions, scopes, etag, function(etag) {
                rLib.found(res, patchedPermissions, req.headers.accept, `/permsissions?${subject}`, etag)
                var hrend = process.hrtime(hrstart)
                log('updatePermissions', `success, time: ${hrend[0]}s ${hrend[1]/1000000}ms`)
              })
            })
          })
        } else {
          var err = (req.headers['if-match'] === undefined) ? 'missing If-Match header' : 'If-Match header does not match etag ' + req.headers['If-Match'] + ' ' + etag
          rLib.preconditionFailed(res, err)
        }
      })
    })
  })
}

function putPermissions(req, res, subject, permissions) {
  var hrstart = process.hrtime()
  log('putPermissions', `start subject: ${subject}`)
  pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, subject, '_self', 'govern', function() {
    var new_ancestors = '_inheritsPermissionsOf' in permissions ? permissions._inheritsPermissionsOf : []
    ifAllowedToInheritFromThen(req, res, subject, new_ancestors, function(scopes) {
      verifyPermissions(req, res, permissions, function () {
        permissions._metadata.modifier = lib.getUser(req.headers.authorization)
        permissions._metadata.modified = new Date().toISOString()
        db.putPermissionsThen(req, res, subject, permissions, scopes, function(etag) {
          addCalculatedProperties(req, permissions) 
          rLib.found(res, permissions, req.headers.accept, `/permsissions?${subject}`, etag)
          var hrend = process.hrtime(hrstart)
          log('putPermissions', `success, time: ${hrend[0]}s ${hrend[1]/1000000}ms`)
        })
      })
    })
  })
}

function getUsersWhoCanAccess(req, res, subject) {
  function addUsersWhoCanAcess(req, res, permissions, result, callback) {
    var sharedWith = permissions._metadata.sharedWith
    if (sharedWith !== undefined)
      for (var i=0; i < sharedWith.length; i++)
        result[sharedWith[i]] = true
    var sharingSets = permissions._inheritsPermissionsOf
    if (sharingSets !== undefined) {
      var count = 0
      for (let j = 0; j < sharingSets.length; j++) 
        db.withPermissionsDo(req, res, sharingSets[j], function(permissions, etag) {
          pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, sharingSets[j], '_self', 'admin', function() {
            addUsersWhoCanAcess(req, res, permissions, result, function() {
              if (++count == sharingSets.length) {callback()}
            })
          })
        })
    } else
      callback()
  }
  var result = {}
  subject = lib.internalizeURL(subject, req.headers.host)
  db.withPermissionsDo(req, res, subject, function(permissions, etag) {
    pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, subject, '_self', 'admin', function() {
      addUsersWhoCanAcess(req, res, permissions, result, function() {
        rLib.found(res, Object.keys(result), req.headers.accept, req.url)
      })
    })
  })
}

function getResourcesSharedWith(req, res, user) {
  var hrstart = process.hrtime()
  log('getResourcesSharedWith', `start user: ${JSON.stringify(user)}`)
  var requestingUser = lib.getUser(req.headers.authorization)
  user = lib.internalizeURL(user, req.headers.host)
  if (user == requestingUser || user == INCOGNITO || (requestingUser !== null && user == ANYONE))
    withTeamsDo(req, res, user, function(actors) {
      db.withResourcesSharedWithActorsDo(req, res, actors, function(resources) {
        rLib.found(res, resources, req.headers.accept, req.url)
        var hrend = process.hrtime(hrstart)
        log('getResourcesSharedWith', `success, time: ${hrend[0]}s ${hrend[1]/1000000}ms`)
      })
    })
  else
    rLib.forbidden(res, `user ${requestingUser} may not access ${req.url} (user:${user})`)
}

function getResourcesSharedWithTeamTransitively(req, res, team) {
  var hrstart = process.hrtime()
  log('getResourcesSharedWithTeamTransitively', `start team: ${team}`)
  function withHeirsRecursive(req, res, resources, result, callback) {
    db.withHeirsDo(req, res, resources, function(heirs) {
      if (heirs.length > 0) {
        heirs = heirs.filter(heir => result.indexOf(heir) == -1)
        for (let i = 0; i < heirs.length; i++) 
          result.push(heirs[i])
        withHeirsRecursive(req, res, heirs, result, function(){
          callback(result)                
        })
      } else
        callback(result)
    })
  }
  pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, team, '_self', 'update', function() {
    db.withResourcesSharedWithActorsDo(req, res, [team], function(resources) {
      var envelope = {
        kind: 'Collection',
        self: req.url
      }
      if (resources.length > 0) {
        var result = resources.slice()
        withHeirsRecursive(req, res, resources, result, function(){
          envelope.contents = result
          lrLibib.found(res, envelope, req.headers.accept, req.url)
          var hrend = process.hrtime(hrstart)
          log('getResourcesSharedWithTeamTransitively', `success, time: ${hrend[0]}s ${hrend[1]/1000000}ms`)
        })
      } else {
        envelope.contents = resources
        lirLibb.found(res, envelope, req.headers.accept, req.url)
        var hrend = process.hrtime(hrstart)
        log('getResourcesSharedWithTeamTransitively', `success, time: ${hrend[0]}s ${hrend[1]/1000000}ms`)
      }        
    })
  })
}

function getPermissionsHeirs(req, res, subject) {
  pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, subject, '_self', 'read', function() {
    db.withHeirsDo(req, res, subject, function(heirs) {
      var body = {
        kind: "Collection",
        self: req.url,
        contents: heirs
      }
      rLib.found(res, body, req.headers.accept, req.url)
    })
  })
}

function getPermissionsHeirsDetails(req, res, queryString) {
  var params = querystring.parse(queryString)
  var subject = params.resource
  var properties = params.property ? (Array.isArray(params.property) ? params.property : [params.property]) : []
  log('getPermissionsHeirsDetails', `start subject: ${subject}`)
  if (properties.length == 0)
    getPermissionsHeirs(req, res, subject)
  else
    pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, subject, '_self', 'read', function() {
      db.withHeirsDo(req, res, subject, function(heirs) {
        var heirsDetails = []
        var result = {
          kind: "Collection",
          self: req.url,
          contents: heirsDetails
        }
        if (heirs.length > 0) {
          var includeSharedWith = properties.indexOf('_sharedWith') > -1 || properties.indexOf('_sharedWithCount') > -1
          var db_count = includeSharedWith ? 0 : heirs.length
          var http_count = 0
          for (let i=0; i < heirs.length; i++) {
            let heir = lib.externalizeURLs(url.resolve(`http://${req.headers.host}${req.url}`, heirs[i]))
            heirsDetails[i] = {self: heir}
            if (includeSharedWith)
              db.db.withPermissionsDo(req, subject, function(err, permissions) {
                if (!err) {
                  if (properties.indexOf('_sharedWith') > -1)
                    heirsDetails[i]._sharedWith = permissions._metadata.sharedWith
                  if (properties.indexOf('_sharedWithCount') > -1)
                    heirsDetails[i]._sharedWithCount = permissions._metadata.sharedWith.length
                }
                if (++db_count == heirs.length && http_count == heirs.length)
                  rLib.found(res, result, req.headers.accept, req.url)
              })  
            if (properties.length > 0)
              lib.sendInternalRequest('GET', heirs[i], lib.flowThroughHeaders(req), null, function(err, clientRes) {
                if (err) {
                  if (++http_count == heirs.length && db_count == heirs.length)
                    rLib.found(res, result, req.headers.accept, req.url)
                } else 
                  lib.getClientResponseBody(clientRes, function (body) {
                    try {
                      var parsedData = JSON.parse(body);
                    } catch (e) {
                      log('getPermissionsHeirsDetails', e.message);
                    }
                    if (clientRes.statusCode == 200 && parsedData) { 
                      var heirsDetail = heirsDetails[i]
                      for (var j = 0; j < properties.length; j++) {
                        var property = properties[j]
                        if (property in parsedData)
                          heirsDetail[property] = parsedData[property]
                      }
                    }
                    if (++http_count == heirs.length && db_count == heirs.length)
                      rLib.found(res, result, req.headers.accept, req.url)
                  })              
              })
          }
        } else
          rLib.found(res, result, req.headers.accept, req.url)
      })
    })
}

function withTeamsDo(req, res, user, callback) {
  if (user !== null) {
    user = lib.internalizeURL(user)
    var teamsURL = `/az-teams?${user.replace('#', '%23')}`
    lib.sendInternalRequestThen(res, 'GET', teamsURL, lib.flowThroughHeaders(req), undefined, function (clientResponse) {
      lib.getClientResponseBody(clientResponse, function(body) {
        if (clientResponse.statusCode == 200) { 
          var actors = JSON.parse(body).contents
          lib.internalizeURLs(actors, req.headers.host)
          actors.push(user)
          callback(actors)
        } else {
          var err = `withTeamsDo: unable to retrieve ${teamsURL} statusCode ${clientResponse.statusCode} text: ${body}`
          log('withTeamsDo', err)
          rLib.internalError(res, err)
        }
      })
    })
  }
}

function requestHandler(req, res) {
  if (req.url == '/az-permissions')
    if (req.method == 'POST')
      lib.getServerPostObject(req, res, (p) => createPermissions(req, res, p))
    else
      rLib.methodNotAllowed(res, ['POST'])
  else {
    var req_url = url.parse(req.url)
    if (req_url.pathname == '/az-permissions' && req_url.search !== null)
      if (req.method == 'GET') 
        getPermissions(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host))
      else if (req.method == 'DELETE') 
        deletePermissions(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host))
      else if (req.method == 'PATCH')  
        lib.getServerPostObject(req, res, (body) => updatePermissions(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host), body))
      else if (req.method == 'PUT')  
        lib.getServerPostObject(req, res, (body) => putPermissions(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host), body))
      else 
        rLib.methodNotAllowed(res, ['GET', 'PATCH', 'PUT'])
    else if (req_url.pathname == '/az-resources-accessible-by-team-members' && req_url.search !== null)
      if (req.method == 'GET')
        getResourcesSharedWithTeamTransitively(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host))
      else
        rLib.methodNotAllowed(res, ['GET'])
    else if (req_url.pathname == '/az-resources-shared-with' && req_url.search !== null)
      if (req.method == 'GET')
        getResourcesSharedWith(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host))
      else
        rLib.methodNotAllowed(res, ['GET'])
    else if (req_url.pathname == '/az-permissions-heirs' && req_url.search !== null)
      if (req.method == 'GET') 
        getPermissionsHeirs(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host))
      else
        rLib.methodNotAllowed(res, ['GET'])
    else if (req_url.pathname == '/az-permissions-heirs-details' && req_url.search !== null) 
      if (req.method == 'GET') 
        getPermissionsHeirsDetails(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host))
      else
        rLib.methodNotAllowed(res, ['GET'])
    else if (req_url.pathname == '/az-users-who-can-access' && req_url.search !== null)
      if (req.method == 'GET')
        getUsersWhoCanAccess(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host))
      else
        rLib.methodNotAllowed(res, ['GET'])
    else
      rLib.notFound(res, `//${req.headers.host}${req.url} not found`)
  }
}

function init(callback, aPool) {
  db.init(callback, aPool)
}

var port = process.env.PORT
function run(){
  init(function(){
    http.createServer(requestHandler).listen(port, function() {
      log('start', `server is listening on ${port}`)
    })
  })
}

function start() {
  if (require.main === module) 
    run()
  else
    module.exports = {
      requestHandler:requestHandler,
      paths: ['/az-permissions', '/az-resources-accessible-by-team-members', '/az-resources-shared-with', '/az-permissions-heirs', '/az-permissions-heirs-details', '/az-users-who-can-access'],
      init: init
    }
}

if (process.env.INTERNAL_SY_ROUTER_HOST == 'kubernetes_host_ip') 
  lib.getHostIPThen(function(err, hostIP){
    if (err) 
      process.exit(1)
    else {
      process.env.INTERNAL_SY_ROUTER_HOST = hostIP
      start()
    }
  })
else 
  start()
    