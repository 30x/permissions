'use strict'
const lib = require('http-helper-functions')
const http = require('http')
var keepAliveAgent = new http.Agent({ keepAlive: true });
var d3 = require('d3-random')

const PERMISSIONS_SCHEME = process.env.scheme || 'http'
const PERMISSIONS_HOSTNAME = process.env.host || 'localhost'
const PERMISSIONS_PORT = process.env.port || 8080

const numberOfUsers = process.env.numberOfUsers || 1
const numberOfOrgs  = process.env.numberOfOrgs || 1
const meanNumberOfDevelopersPerOrg = process.env.meanNumberOfDevelopersPerOrg || 8
const meanNumberOfAppsPerOrg = process.env.meanNumberOfAppsPerOrg || 5
const deviationsOfDevelopersPerOrg = process.env.deviationsOfDevelopersPerOrg || 1.5
const deviationsOfAppsPerOrg = process.env.deviationsOfAppsPerOrg || 1.5

var queue = Array()
var outstandingRequests = 0
var totalRequests = 0
const maxOutstandingRequests = 20

function schedule(func) {
  function scheduleCallback(callback) {
    totalRequests++
    return function() {
      if (queue.length > 0)
        queue.shift()(scheduleCallback)
      else
        --outstandingRequests
      callback.apply(this, arguments)
    }    
  }
  if (outstandingRequests > maxOutstandingRequests)
    queue.push(func)
  else {
    ++outstandingRequests
    func(scheduleCallback)
  }
}

const tokens = new Array()
const users = new Array()
for (let i = 0; i < numberOfUsers; i++) {
  let claims = {iss: 'http://shady-guys-idp.ru', sub: lib.uuid4()}
  let jwt = '.' + new Buffer(JSON.stringify(claims)).toString('base64') + '.'
  tokens.push(jwt)
  users.push(lib.getUserFromToken(jwt))
}

const orgAdmins = new Array()
const orgAdminTokens = new Array()
for (let i = 0; i < numberOfOrgs; i++) {
  let claims = {iss: 'http://shady-guys-idp.ru', sub: lib.uuid4()}
  let jwt = '.' + new Buffer(JSON.stringify(claims)).toString('base64') + '.'
  orgAdminTokens.push(jwt)
  orgAdmins.push(lib.getUserFromToken(jwt))
}

/* Create a permissions document for each org */
const orgs = Array()
const orgEtags = Array()
for (let i = 0; i < numberOfOrgs; i++) {
  orgs[i] = `/o/${lib.uuid4()}`
  let orgPermissions = {
    _subject: orgs[i] ,
    _permissions: {read: [orgAdmins[i]], update: [orgAdmins[i]]},
    _permissionsHeirs: {read: [orgAdmins[i]], add: [orgAdmins[i]], remove: [orgAdmins[i]]},
    'test-data': true
  }
 schedule(function(callback) {
   sendRequest('POST', '/permissions', {Authorization: `Bearer ${orgAdminTokens[i]}`}, JSON.stringify(orgPermissions), callback(function(err, res) {
    if (err) {
      console.log(err)
      return
    } else {
      getResponseBody(res, function(body) {
        if (res.statusCode == 201) {
          orgEtags[i] = res.headers['etag']
          createTeam(i)
        }
        else {
          console.log(`failed to create permissions for ${orgPermissions._subject} statusCode: ${res.statusCode} text: ${body}`)
        }
      })
    }
   }))
 })
} 

/* Create org admins team for each org */

const orgAdminTeams = new Array()
function createTeam(i) {
  let team = {
    isA: 'Team',
    _permissions: {_inheritsPermissionsOf: [orgs[i]], 'test-data': true},
    members: [orgAdmins[i]],
    'test-data': true
  }
  schedule(function(callback) {
    sendRequest('POST', '/teams', {Authorization: `Bearer ${orgAdminTokens[i]}`}, JSON.stringify(team), callback(function(err, res) {
      if (err) {
        console.log(err)
        return
      } else {
        getResponseBody(res, function(body) {
          if (res.statusCode == 201) {
            orgAdminTeams[i] = res.headers['location']
            patchOrg(i)
          }
          else {
            console.log(`failed to create org admin team statusCode: ${res.statusCode} text: ${body}`)
          }
        })
      }
    }))
  })
}

/* Patch permissions document for each org to reference org admins team */
function patchOrg(i) {
  let orgPermissions = {
    _permissions: {read: [orgAdminTeams[i]], update: [orgAdminTeams[i]], delete: [orgAdminTeams[i]]},
    _permissionsHeirs: {read: [orgAdminTeams[i]], add: [orgAdminTeams[i]], remove: [orgAdminTeams[i]]},
    'test-data': true
  }
  var headers = {
    Authorization: `Bearer ${orgAdminTokens[i]}`, 
    'Content-Type': 'application/merge-patch+json',
    'If-Match': orgEtags[i]
  }
  schedule(function(callback) {
    sendRequest('PATCH', `/permissions?${orgs[i]}`, headers, JSON.stringify(orgPermissions), callback(function(err, res) {
      if (err) {
        console.log(err)
        return
      } else {
        getResponseBody(res, function(body) {
          if (res.statusCode == 200) {
            createOrgApps(i)
            createOrgDevelopers(i)
          }
          else {
            console.log(`failed to patch permissions for ${orgs[i]} statusCode: ${res.statusCode} text: ${body}`)
          }
        })
      }
    }))
  })
}

function createOrgApps(i) {
  var randomLogNormal = d3.randomLogNormal(meanNumberOfAppsPerOrg, deviationsOfAppsPerOrg)
  var count = Math.floor(randomLogNormal())
  console.log('# of apps', count)
  for (let j = 0; j < count; j++) {
    let appPermissions = {
      _subject: `/apps/${lib.uuid4()}`,
      _permissions: {_inheritsPermissionsOf: orgs[i]},
      'test-data': true
    }
    schedule(function(callback) {
      sendRequest('POST', '/permissions', {Authorization: `Bearer ${orgAdminTokens[i]}`}, JSON.stringify(appPermissions), callback(function(err, res) {
        if (err) {
          console.log(err)
          return
        } else {
          getResponseBody(res, function(body) {
            if (res.statusCode == 201) {
            }
            else {
              console.log(`failed to create permissions for ${appPermissions._subject} statusCode: ${res.statusCode} text: ${body}`)
            }
          })
        }
      }))
    })
  }
}

function createOrgDevelopers(i) {
  var randomLogNormal = d3.randomLogNormal(meanNumberOfDevelopersPerOrg, deviationsOfDevelopersPerOrg)
  var count = Math.floor(randomLogNormal())
  console.log('# of devs', count)
  for (let j = 0; j < count; j++) {
    let devPermissions = {
      _subject: `/devs/${lib.uuid4()}`,
      _permissions: {_inheritsPermissionsOf: orgs[i]},
      'test-data': true
    }
    schedule(function(callback) {
      var hrstart = process.hrtime()
      sendRequest('POST', '/permissions', {Authorization: `Bearer ${orgAdminTokens[i]}`}, JSON.stringify(devPermissions), callback(function(err, res) {
        if (err) {
          console.log(err)
          return
        } else {
          getResponseBody(res, function(body) {
            if (res.statusCode == 201) {
              var hrend = process.hrtime(hrstart)
              //console.log(`load-test:createDeveloper:success, time: ${hrend[0]}s ${hrend[1]/1000000}ms`)
            }
            else {
              console.log(`failed to create permissions for ${devPermissions._subject} statusCode: ${res.statusCode} text: ${body}`)
            }
          })
        }
      }))
    })
  }
}

function sendRequest(method, requestURI, headers, body, callback) {
  var options = {
    protocol: `${PERMISSIONS_SCHEME}:`,
    hostname: PERMISSIONS_HOSTNAME,
    path: requestURI,
    method: method,
    headers: headers,
    agent: keepAliveAgent
  }
  if (PERMISSIONS_HOSTNAME)
    options.port = PERMISSIONS_PORT
  var clientReq = http.request(options, function(clientRes) {
    callback(null, clientRes)
  })
  clientReq.on('error', function (err) {
    console.log(`load-test.js sendRequest: error ${err}`)
    callback(err)
  })
  if (body) 
    clientReq.write(body)
  clientReq.end()
}

function getResponseBody(res, callback) {
  res.setEncoding('utf8')
  var body = ''
  res.on('data', chunk => body += chunk)
  res.on('end', () => callback(body))
}
