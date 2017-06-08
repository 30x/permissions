'use strict'
const lib = require('http-helper-functions')
const http = require('http')
var keepAliveAgent = new http.Agent({ keepAlive: true });
var d3 = require('d3-random')
var fs = require('fs')
var Stats = require('fast-stats').Stats

const PERMISSIONS_SCHEME = process.env.scheme || 'http'
const PERMISSIONS_HOSTNAME = process.env.host || 'localhost'
const PERMISSIONS_PORT = process.env.port || 8080
const ROUTING_API_KEY = process.env.routing_api_key

const numberOfUsers = process.env.numberOfUsers || 1
const numberOfOrgs  = process.env.numberOfOrgs || 1
const meanNumberOfDevelopersPerOrg = process.env.meanNumberOfDevelopersPerOrg || 8
const meanNumberOfAppsPerOrg = process.env.meanNumberOfAppsPerOrg || 5
const deviationsOfDevelopersPerOrg = process.env.deviationsOfDevelopersPerOrg || 1.5
const deviationsOfAppsPerOrg = process.env.deviationsOfAppsPerOrg || 1.5

const numberOfIsAllowedCallsPerApp = process.env.numberOfIsAllowedCallsPerApp || 1.5

var queue = Array()
var outstandingRequests = 0
var totalRequests = 0
const maxOutstandingRequests = 1

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
    _self: {admin: [orgAdmins[i]], govern: [orgAdmins[i]]},
    _permissionsHeirs: {read: [orgAdmins[i]], add: [orgAdmins[i]], remove: [orgAdmins[i]]},
    'test-data': true
  }
 schedule(function(callback) {
   sendRequest('POST', '/az-permissions', {Authorization: `Bearer ${orgAdminTokens[i]}`}, JSON.stringify(orgPermissions), callback(function(err, res) {
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
function createTeam(orgIndex) {
  let team = {
    isA: 'Team',
    _permissions: {_inheritsPermissionsOf: [orgs[orgIndex]], 'test-data': true},
    members: [orgAdmins[orgIndex]],
    'test-data': true
  }
  schedule(function(callback) {
    sendRequest('POST', '/az-teams', {Authorization: `Bearer ${orgAdminTokens[orgIndex]}`}, JSON.stringify(team), callback(function(err, res) {
      if (err) {
        console.log(err)
        return
      } else {
        getResponseBody(res, function(body) {
          if (res.statusCode == 201) {
            orgAdminTeams[orgIndex] = res.headers['location']
            patchOrg(orgIndex)
          } else {
            console.log(`failed to create org admin team statusCode: ${res.statusCode} text: ${body}`)
          }
        })
      }
    }))
  })
}

/* Patch permissions document for each org to reference org admins team */
function patchOrg(orgIndex) {
  let orgPermissions = {
    _self: {admin: [orgAdminTeams[orgIndex]], govern: [orgAdminTeams[orgIndex]]},
    _permissionsHeirs: {read: [orgAdminTeams[orgIndex]], add: [orgAdminTeams[orgIndex]], remove: [orgAdminTeams[orgIndex]]},
    'test-data': true
  }
  var headers = {
    Authorization: `Bearer ${orgAdminTokens[orgIndex]}`, 
    'Content-Type': 'application/merge-patch+json',
    'If-Match': orgEtags[orgIndex]
  }
  schedule(function(callback) {
    sendRequest('PATCH', `/az-permissions?${orgs[orgIndex]}`, headers, JSON.stringify(orgPermissions), callback(function(err, res) {
      if (err) {
        console.log(err)
        return
      } else {
        getResponseBody(res, function(body) {
          if (res.statusCode == 200) {
            createOrgApps(orgIndex)
            createOrgDevelopers(orgIndex)
          }
          else {
            console.log(`failed to patch permissions for ${orgs[orgIndex]} statusCode: ${res.statusCode} text: ${body}`)
          }
        })
      }
    }))
  })
}

function createOrgApps(orgIndex) {
  var randomLogNormal = d3.randomLogNormal(meanNumberOfAppsPerOrg, deviationsOfAppsPerOrg)
  var count = Math.floor(randomLogNormal())
  console.log('# of apps', count)
  for (let j = 0; j < count; j++) {
    let appPermissions = {
      _subject: `/apps/${lib.uuid4()}`,
      _permissions: {_inheritsPermissionsOf: orgs[orgIndex]},
      'test-data': true
    }
    schedule(function(callback) {
      sendRequest('POST', '/az-permissions', {Authorization: `Bearer ${orgAdminTokens[orgIndex]}`}, JSON.stringify(appPermissions), callback(function(err, res) {
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

var orgDevelopers = Array()
function createOrgDevelopers(orgIndex) {
  var randomLogNormal = d3.randomLogNormal(meanNumberOfDevelopersPerOrg, deviationsOfDevelopersPerOrg)
  var count = Math.floor(randomLogNormal())
  console.log('# of devs', count)
  var processedCount = 0;
  var times = Array()
  var hrstartall
  var developers = Array()
  orgDevelopers[orgIndex] = developers
  for (let j = 0; j < count; j++) {
    developers[j] = `/devs/${lib.uuid4()}`
    let devPermissions = {
      _subject: developers[j],
      _permissions: {_inheritsPermissionsOf: orgs[orgIndex]},
      'test-data': true
    }
    schedule(function(callback) {
      var hrstart = process.hrtime()
      if (hrstartall === undefined)
        hrstartall = hrstart
      sendRequest('POST', '/az-permissions', {Authorization: `Bearer ${orgAdminTokens[orgIndex]}`}, JSON.stringify(devPermissions), callback(function(err, res) {
        processedCount++
        if (err) {
          console.log(err)
          return
        } else {
          getResponseBody(res, function(body) {
            if (res.statusCode == 201) {
              process.stdout.write(`Developer #: ${j}\r`)
              var hrend = process.hrtime(hrstart)
              times[j] = hrend[0] + hrend[1]/1000000000
              if (processedCount >= count) {
                var hrendall = process.hrtime(hrstartall)
                var fileName = `dev_timings${orgs[orgIndex]}.json`.replace(new RegExp('/','g'),'-')
                fs.writeFile(fileName, JSON.stringify(times), function(err) {
                  if(err)
                    return console.log(err)
                  else {
                    console.log(`${fileName} was saved!`)
                    var s = new Stats().push(times)
                    console.log('    mean:           ', s.amean().toFixed(4), 'ms')    
                    console.log('    50th percentile:', s.percentile(50).toFixed(4), 'ms')    
                    console.log('    90th percentile:', s.percentile(90).toFixed(4), 'ms')    
                    console.log('    99th percentile:', s.percentile(99).toFixed(4), 'ms')    
                    console.log('    range:          ', s.range(), 'ms')    
                    console.log('    tps:            ', count / (hrendall[0] + hrendall[1]/1000000000))
                  }
                })
                getIsAllowedRandomly(orgIndex)
              }
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

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}

function getIsAllowedRandomly(orgIndex) {
  var times = Array()
  var count = numberOfIsAllowedCallsPerApp
  var processedCount = 0;
  var hrstartall
  for (let i = 0; i < numberOfIsAllowedCallsPerApp; i++) {
    let developers = orgDevelopers[orgIndex]
    let userIndex = getRandomInt(0, users.length)
    let user = users[userIndex]
    let userToken = tokens[userIndex]
    let developer = developers[getRandomInt(0, developers.length)]
    schedule(function(callback) {
      var hrstart = process.hrtime()
      if (hrstartall === undefined)
        hrstartall = hrstart
      sendRequest('GET', `/az-is-allowed?resource=${developer}&user=${user.replace('#', '%23')}&action=read`, {Authorization: `Bearer ${userToken}`}, null, callback(function(err, res) {
        processedCount++
        if (err) {
          console.log(err)
          return
        } else {
          getResponseBody(res, function(body) {
            if (res.statusCode == 200) {
              var hrend = process.hrtime(hrstart)
              process.stdout.write(`isAllowed: ${body} time: ${hrend[0] + hrend[1]/1000000000}\r`)
              times[i] = hrend[0] + hrend[1]/1000000000
              if (processedCount >= count) {
                var hrendall = process.hrtime(hrstartall)
                var fileName = `is_allowed_timings${orgs[orgIndex]}.json`.replace(new RegExp('/','g'),'-')
                fs.writeFile(fileName, JSON.stringify(times), function(err) {
                  if(err)
                    return console.log(err)
                  else {
                    console.log(`${fileName} was saved!`)
                    var s = new Stats().push(times)
                    console.log('    mean:           ', s.amean().toFixed(4), 'ms')    
                    console.log('    50th percentile:', s.percentile(50).toFixed(4), 'ms')    
                    console.log('    90th percentile:', s.percentile(90).toFixed(4), 'ms')    
                    console.log('    99th percentile:', s.percentile(99).toFixed(4), 'ms')    
                    console.log('    range:          ', s.range(), 'ms')    
                    console.log('    tps:            ', count / (hrendall[0] + hrendall[1]/1000000000))
                  }
                })
              }
            }
            else {
              console.log(`failed to read isAllowed for ${developer} statusCode: ${res.statusCode} text: ${body}`)
            }
          })
        }
      }))
    })
  }
}

function sendRequest(method, requestURI, headers, body, callback, port) {
  if (ROUTING_API_KEY)
    headers['x-routing-api-key'] = ROUTING_API_KEY
  var options = {
    protocol: `${PERMISSIONS_SCHEME}:`,
    hostname: PERMISSIONS_HOSTNAME,
    path: requestURI,
    method: method,
    headers: headers,
    agent: keepAliveAgent
  }
  if (port)
    options.port = port
  else
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
