'use strict'
const http = require('http')
const https = require('https')
const url = require('url')
const lib = require('http-helper-functions')
const rLib = require('response-helper-functions')
const templates = require('./templates.js')
const pLib = require('permissions-helper-functions')
const db = require('./permissions-migration-pg.js')

const CONFIGURED_EDGE_ADDRESS = process.env.EDGE_ADDRESS // something of the form https://api.e2e.apigee.net or https://api.enterprise.apigee.net
const CONFIGURED_EDGE_HOST = CONFIGURED_EDGE_ADDRESS.split(':')[1].replace('//', '') // // something of the form api.e2e.apigee.net or api.enterprise.apigee.net
const CLIENT_ID = process.env.PERMISSIONS_CLIENTID
const CLIENT_SECRET = process.env.PERMISSIONS_CLIENTSECRET
const COMPONENT_NAME = 'permissions-migration'

const REMIGRATION_CHECK_INTERVAL = 60 * 1000  // every minute
const REMIGRATION_INTERVAL = 5 * 60 * 1000    // every 5 minutes 
const SPEEDUP = process.env.SPEEDUP || 1

function log(functionName, text) {
  console.log(Date.now(), COMPONENT_NAME, functionName, text)
}

function handleMigrationRequest(req, res, body){
  log('handleMigrationRequest', `resource: ${body.resource}`)
  var requestUser = lib.getUser(req.headers.authorization)
  if (requestUser === null)
    rLib.unauthorized(res, `bearer token missing or expired`)
  else {
    var issuer = requestUser.split('#')[0]
    withClientCredentialsDo(res, issuer, function (clientToken) {
      verifyMigrationRequest(res, body, function (orgName, orgURL) {
        attemptMigration(res, clientToken, orgName, orgURL, issuer, clientToken, function (param) {
          rLib.ok(res)
        })
      })
    })
  }
}

function handleReMigration(res, issuer, clientToken, body){ 
  verifyMigrationRequest(res, body, function(orgName, orgURL) {
    performMigration(res, orgName, orgURL, issuer, clientToken, function() {
      rLib.ok(res)              
    }, function() {
      rLib.badRequest(res, {msg: `migration in progress for org: ${orgURL}`})
    })
  })
}

function handleReMigrationRequest(req, res, body){ 
  var requestUser = lib.getUser(req.headers.authorization)
  var issuer = requestUser.split('#')[0]  
  withClientCredentialsDo(res, issuer, function(clientToken) { 
    handleReMigration(res, issuer, clientToken, body)
  })
}

function verifyMigrationRequest(res, body, callback) {
  if(body.resource == null)
    rLib.badRequest(res, 'json property resource is required')
  else {
    var orgRegex = new RegExp("^(?:http://|https://)([^/]+)/v1/(?:o|organizations)/([^/]+)/?.*$")
    var matches = body.resource.match(orgRegex)
    if(!matches || matches.length < 3 || CONFIGURED_EDGE_HOST !== matches[1])
      // doesn't look like an Edge resource or the configured edge hostname does not match the resource's hostname
      rLib.notFound(res, {msg: "doesn't look like an Edge resource or the configured edge hostname does not match the resource's hostname"})
    else {
      var resource = matches[0]
      var edgeHost = matches[1]
      var orgName = matches[2]
      var orgURL = CONFIGURED_EDGE_ADDRESS + '/v1/o/' + orgName
      if (orgName == null)
        rLib.badRequest(res, {msg: 'orgName required in order to migrate permissions'})
      else
        callback(orgName, orgURL)
    }
  }
} 

function attemptMigration (res, auth, orgName, orgURL, issuer, clientToken, callback) {
  log('attemptMigration', `orgName: ${orgName} orgURL: ${orgURL} issuer: ${issuer}`)
  var retryCount = 0;
  function seeIfMigrationNeeded () {
    // check to see if permissions already exist first
    lib.sendInternalRequest('GET', `/az-permissions?${orgURL}`, {authorization: `Bearer ${clientToken}`}, null, function(err, clientRes){
      if (err)
        rLib.internalError(res, {msg: `unable to GET permissions: /az-permissions?${orgURL} err: ${err}`})
      else if (clientRes.statusCode == 200)
        rLib.duplicate(res, {msg: `Permissions already exist for ${orgURL}`})
      else if (clientRes.statusCode == 404)
        performMigration(res, orgName, orgURL, issuer, clientToken, function(param) {
          callback(param)
        }, function() {
          setTimeout(function() {
            if(++retryCount < 2)
              seeIfMigrationNeeded ()
            else
              rLib.internalError(res, {msg: `unable to get migration flag for orgURL ${orgURL}`})
          }, 1000)
        })
      else
        rLib.internalError(res, {msg: 'status: '+clientRes.statusCode+', unable to verify if permissions already exist for resource '+orgURL})
    })
  }
  seeIfMigrationNeeded ()
}

function performMigration(res, orgName, orgURL, issuer, clientToken, callback, busyCallback) {
  log('performMigration', `orgName: ${orgName} orgURL: ${orgURL} issuer: ${issuer}`)
  var initialRecord = {orgName: orgName, teams:{}, issuer: issuer, initialMigration: true}
  db.setMigratingFlag(orgURL, initialRecord, function(err, migrating, migrationRecord) {
    if (err)
      rLib.internalError(res, {msg: 'unable to set migrating flag', err: err})
    else if (migrating) {
      log('performMigration' ,`migration request while migration request in progress for ${orgURL}`)
      busyCallback()
    } else
      migrateOrgPermissionsFromEdge(res, orgName, orgURL, issuer, clientToken, migrationRecord, callback)
  })  
}

function withClientCredentialsDo(res, issuer, callback) {
  // build up a new request object with the client credentials used for getting user UUIDs from their emails
  var clientAuthEncoded = new Buffer(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
  var tokenHeaders = {}
  tokenHeaders['authorization'] = 'Basic ' + clientAuthEncoded
  tokenHeaders['Accept'] = 'application/json'
  tokenHeaders['Content-Type'] = 'application/x-www-form-urlencoded'
  // get client credentials token with scim.ids read scope so we can translate emails to user UUIDs
  sendExternalRequestThen(res, tokenHeaders, issuer, '/oauth/token', 'POST', 'grant_type=client_credentials', function (clientRes) {
    lib.getClientResponseBody(clientRes, function (body) {
      if (clientRes.statusCode == 200) {
        var clientToken = JSON.parse(body).access_token
        callback(clientToken)
      } else {
        var msg = {msg: 'unable to authenticate with IDs service to perform migration', statusCode: clientRes.statusCode}
        log('withClientCredentialsDo', msg)
        rLib.internalError(res, msg)
      }
    })
  })
}

function withEdgeUserUUIDsDo(res, issuer, clientToken, edgeRolesAndPermissions, callback) {
  var clientHeaders = {}
  clientHeaders['Accept'] = 'application/json'
  clientHeaders['Content-Type'] = 'application/json'
  clientHeaders.authorization = 'Bearer ' + clientToken
  // translate the user emails to their SSO UUIDs
  var allUsers = []
  for (var edgeRoleName in edgeRolesAndPermissions) {
    allUsers = allUsers.concat(edgeRolesAndPermissions[edgeRoleName].users) // allows duplicates, that's fine
  }
  sendExternalRequestThen(res, clientHeaders, issuer, '/ids/Users/emails/', 'POST', JSON.stringify(allUsers), function (clientRes) {
    if (clientRes.statusCode !== 200)
      rLib.internalError(res, 'unable to obtain UUIDs for Edge users')
    else
      lib.getClientResponseBody(clientRes, function (body) {
        var ssoUsers = JSON.parse(body)
        callback(null, ssoUsers)
      })
  })
}

function buildTeam(orgName, orgURL, edgeRoleName, edgeRole, emailToPermissionsUserMapping) {
  var permissionsUsers = edgeRole.users.map(user => emailToPermissionsUserMapping[user])
  var team = templates.team(orgName, orgURL, edgeRoleName, permissionsUsers)
  team.roles = {}
  var teamRole = {}
  team.roles[orgURL] = teamRole
  var resourcePermission = edgeRole.permissions.resourcePermission
  for (var i=0; i< resourcePermission.length; i++)
    teamRole[resourcePermission[i].path] = resourcePermission[i].permissions  
  return team
}

function migrateOrgPermissionsFromEdge(res, orgName, orgURL, issuer, clientToken, migrationRecord, callback) {
  var existingTeams = migrationRecord.teams
  var headers = {
    'accept': 'application/json',
    'content-type': 'application/json',
    'authorization': `Bearer ${clientToken}`
  }
  getRoleDetailsFromEdge(res, headers, orgName, function (edgeRolesAndPermissions) {
    // the org exists, create initial permissions document
    withEdgeUserUUIDsDo(res, issuer, clientToken, edgeRolesAndPermissions, function(err, ssoUsers) {
      var emailToPermissionsUserMapping = {}
      for (var j = 0; j < ssoUsers.length; j++) {
        emailToPermissionsUserMapping[ssoUsers[j].email] = issuer + '#' + ssoUsers[j].id
      }
      var CLIENT_ID = lib.getUserFromToken(clientToken)
      var orgPermission = templates.orgPermission(orgName, orgURL, CLIENT_ID)
      if (migrationRecord.initialMigration) { // permissions-migration-pg.js sets initialMigration
        let permissionsHeaders = Object.assign({},headers)
        permissionsHeaders['x-client-authorization'] = clientToken
        lib.sendInternalRequestThen(res, 'POST', '/az-permissions', permissionsHeaders, JSON.stringify(orgPermission), function (clientRes) {
          lib.getClientResponseBody(clientRes, function (data) {
            if (clientRes.statusCode != 201) {
              rLib.internalError(res, {
                msg: 'unable to create permissions for org',
                statuscode: clientRes.statusCode,
                data: data
              })
            } else
              makeTeams()
          })
        })
      } else
        makeTeams()

      function makeTeams() {
        // main loop creating teams. permissions resource for org is updated when the last team has been created.
        var totalNumberOfRoles = Object.keys(edgeRolesAndPermissions).length
        var rolesProcessed = 0
        var teams = {}
        for (let edgeRoleName in edgeRolesAndPermissions) {
          var team = buildTeam(orgName, orgURL, edgeRoleName, edgeRolesAndPermissions[edgeRoleName], emailToPermissionsUserMapping)
          if (edgeRoleName in existingTeams)
            lib.sendInternalRequestThen(res, 'PUT', existingTeams[edgeRoleName], headers, JSON.stringify(team), function (clientRes) { 
              lib.getClientResponseBody(clientRes, function (body) {
                if (clientRes.statusCode == 404) // we had a team but its gone
                  lib.sendInternalRequestThen(res, 'POST', '/az-teams', headers, JSON.stringify(team), function (clientRes) {
                    lib.getClientResponseBody(clientRes, function (body) {
                      addRoleToOrg(clientRes, edgeRoleName, body, false)
                    })
                  })
                else
                  addRoleToOrg(clientRes, edgeRoleName, body, true)
              })
            })
          else
            lib.sendInternalRequestThen(res, 'POST', '/az-teams', headers, JSON.stringify(team), function (clientRes) {
              lib.getClientResponseBody(clientRes, function (body) {
                addRoleToOrg(clientRes, edgeRoleName, body, false)
              })
            })
        }

        function addRoleToOrg(clientRes, edgeRoleName, body, replacedWithPut) {
          rolesProcessed++
          if (clientRes.statusCode == 201 || clientRes.statusCode == 200) {
            teams[edgeRoleName] = clientRes.statusCode == 201 ? clientRes.headers.location : clientRes.headers['content-location']
            body = JSON.parse(body)
            var teamLocation = clientRes.headers['location']
            updateOrgPermissons(orgPermission, body.name, teamLocation)
          } else
            log('addRoleToOrg', `unable to ${replacedWithPut ? 'update' : 'create'} team. orgName: ${orgName} role: ${edgeRoleName} stauts: ${clientRes.statusCode} body ${body}`)

          // now create the permissions for the org after looping through all the roles(teams)
          if (rolesProcessed === totalNumberOfRoles) {
            lib.sendInternalRequestThen(res, 'PUT', `/az-permissions?${orgURL}`, headers, JSON.stringify(orgPermission), function (clientRes) {
              db.writeMigrationRecord(orgPermission._subject, {orgName: orgName, teams: teams, issuer: issuer})   
              lib.getClientResponseBody(clientRes, function(body) {
                if (clientRes.statusCode == 200)
                  callback()
                else 
                  rLib.internalError(res, {statusCode: clientRes.statusCode, msg: `failed to create permissions for ${orgURL} statusCode ${clientRes.statusCode} message ${body}`})
              })
            })
          }
        }    
      }
    })
  })
}

function updateOrgPermissons(orgPermission, roleNames, teamLocation) {
  if (roleNames.indexOf('orgadmin') !== -1) {
    // add permissions for the org resource
    orgPermission._self.read.push(teamLocation)
    orgPermission._self.update.push(teamLocation)
    orgPermission._self.put.push(teamLocation)


    // add permissions heirs
    orgPermission._permissionsHeirs.read.push(teamLocation)
    orgPermission._permissionsHeirs.add.push(teamLocation)
    orgPermission._permissionsHeirs.remove.push(teamLocation)

    // subscriptions permissions
    orgPermission.subscriptions.create.push(teamLocation)
    orgPermission.subscriptions.read.push(teamLocation)
    orgPermission.subscriptions.update.push(teamLocation)
    orgPermission.subscriptions.delete.push(teamLocation)

    // notifications permissions
    orgPermission.notifications.create.push(teamLocation)
    orgPermission.notifications.read.push(teamLocation)
    orgPermission.notifications.update.push(teamLocation)
    orgPermission.notifications.delete.push(teamLocation)

    // events permissions
    orgPermission.events.create.push(teamLocation)
    orgPermission.events.read.push(teamLocation)
    orgPermission.events.update.push(teamLocation)
    orgPermission.events.delete.push(teamLocation)

    // history permissions
    orgPermission.history.read.push(teamLocation)
    orgPermission.history.delete.push(teamLocation)

    // templates permissions
    orgPermission.templates.create.push(teamLocation)
    orgPermission.templates.read.push(teamLocation)
    orgPermission.templates.update.push(teamLocation)
    orgPermission.templates.delete.push(teamLocation)


  } else if (roleNames.indexOf('opsadmin') !== -1) {

    orgPermission._self.read.push(teamLocation)
    orgPermission._permissionsHeirs.read.push(teamLocation)
    orgPermission._permissionsHeirs.add.push(teamLocation)

    // subscriptions permissions
    orgPermission.subscriptions.create.push(teamLocation)
    orgPermission.subscriptions.read.push(teamLocation)
    orgPermission.subscriptions.update.push(teamLocation)
    orgPermission.subscriptions.delete.push(teamLocation)

    // notifications permissions
    orgPermission.notifications.create.push(teamLocation)
    orgPermission.notifications.read.push(teamLocation)
    orgPermission.notifications.update.push(teamLocation)
    orgPermission.notifications.delete.push(teamLocation)

    // events permissions
    orgPermission.events.create.push(teamLocation)
    orgPermission.events.read.push(teamLocation)
    orgPermission.events.update.push(teamLocation)
    orgPermission.events.delete.push(teamLocation)

    // history permissions
    orgPermission.history.read.push(teamLocation)
    orgPermission.history.delete.push(teamLocation)

    // templates permissions
    orgPermission.templates.create.push(teamLocation)
    orgPermission.templates.read.push(teamLocation)
    orgPermission.templates.update.push(teamLocation)
    orgPermission.templates.delete.push(teamLocation)


  } else if (roleNames.indexOf('businessuser') !== -1) {
    orgPermission._self.read.push(teamLocation)
    orgPermission._permissionsHeirs.read.push(teamLocation)
    orgPermission._permissionsHeirs.add.push(teamLocation)

    // subscription permissions
    orgPermission.subscriptions.read.push(teamLocation)

    // notifications permissions
    orgPermission.notifications.read.push(teamLocation)

    // events permissions
    orgPermission.events.read.push(teamLocation)

    // history permissions
    orgPermission.history.read.push(teamLocation)

    // templates permissions
    orgPermission.templates.read.push(teamLocation)

  } else if (roleNames.indexOf('user') !== -1) {
    orgPermission._self.read.push(teamLocation)
    orgPermission._permissionsHeirs.read.push(teamLocation)
    orgPermission._permissionsHeirs.add.push(teamLocation)

    // subscription permissions
    orgPermission.subscriptions.read.push(teamLocation)

    // notifications permissions
    orgPermission.notifications.read.push(teamLocation)

    // events permissions
    orgPermission.events.read.push(teamLocation)

    // history permissions
    orgPermission.history.read.push(teamLocation)

    // templates permissions
    orgPermission.templates.read.push(teamLocation)

  } else if (roleNames.indexOf('readonlyadmin') !== -1) {

    // add permissions for the org resource
    orgPermission._self.read.push(teamLocation)

    // add permissions heirs
    orgPermission._permissionsHeirs.read.push(teamLocation)

    // subscription permissions
    orgPermission.subscriptions.read.push(teamLocation)

    // notifications permissions
    orgPermission.notifications.read.push(teamLocation)

    // events permissions
    orgPermission.events.read.push(teamLocation)

    // history permissions
    orgPermission.history.read.push(teamLocation)

    // templates permissions
    orgPermission.templates.read.push(teamLocation)

  } else {
    // not a standard Edge role, just add read permissions for the org for now
    orgPermission._self.read.push(teamLocation)
    orgPermission._permissionsHeirs.read.push(teamLocation)
    orgPermission._permissionsHeirs.add.push(teamLocation)

    // subscription permissions
    orgPermission.subscriptions.read.push(teamLocation)

    // notifications permissions
    orgPermission.notifications.read.push(teamLocation)

    // events permissions
    orgPermission.events.read.push(teamLocation)

    // history permissions
    orgPermission.history.read.push(teamLocation)

    // templates permissions
    orgPermission.templates.read.push(teamLocation)
  }
}

function getRoleDetailsFromEdge(res, callHeaders, orgName, callback) {
  if (orgName == null) 
    rLib.badRequest(res, 'orgName must be provided')
  else {
    var rolesPath = '/v1/o/' + orgName + '/userroles'
    sendExternalRequestThen(res, callHeaders, CONFIGURED_EDGE_ADDRESS, '/v1/o/' + orgName + '/userroles', 'GET', null, function (response) {
      lib.getClientResponseBody(response, function(body) {
        if (response.statusCode !== 200 )
          rLib.internalError(res, {msg: 'Unable to fetch roles from Edge', url: rolesPath, status: response.statusCode, user: lib.getUser(callHeaders.authorization), body: body})
        else {
          var edgeRolesAndPermissions = {}
          var roles = JSON.parse(body)
          var processed = 0
          roles.forEach(x => {
            edgeRolesAndPermissions[x] = {}
            getRoleUsersFromEdge(res, callHeaders, orgName, x, function (users) {
                edgeRolesAndPermissions[x]['users'] = users
              getRolePermissionsFromEdge(res, callHeaders, orgName, x, function (permissions) {
                processed++
                edgeRolesAndPermissions[x]['permissions'] = permissions
                if (processed === roles.length)
                  callback(edgeRolesAndPermissions)
              })
            })
          })
        }
      })
    })
  }
}

function getRoleUsersFromEdge(res, callHeaders, orgName, role, callback) {
  sendExternalRequestThen(res, callHeaders, CONFIGURED_EDGE_ADDRESS, '/v1/o/' + orgName + '/userroles/' + role + '/users', 'GET', null, function (response) {
    lib.getClientResponseBody(response, function (body) {
      callback(JSON.parse(body))
    })
  })
}

function getRolePermissionsFromEdge(res, callHeaders, orgName, role, callback) {
  sendExternalRequestThen(res, callHeaders, CONFIGURED_EDGE_ADDRESS, '/v1/o/' + orgName + '/userroles/' + role + '/az-permissions', 'GET', null, function (response) {
    lib.getClientResponseBody(response, function (body) {
      callback(JSON.parse(body))
    })
  })
}

function sendExternalRequestThen(res, flowThroughHeaders, address, path, method, body, callback) {
  var addressParts = address.toString().split(':')
  var scheme = addressParts[0]
  var host = addressParts[1].replace('//','')
  var useHttps = scheme === 'https'
  var headers = {
    'Accept': 'application/json',
  }
  if (body) {
    headers['Content-Type'] = flowThroughHeaders['Content-Type'] || 'application/json'
    headers['Content-Length'] = Buffer.byteLength(body)
  }
  if (flowThroughHeaders.authorization !== undefined)
    headers.authorization = flowThroughHeaders.authorization
  var options = {
    hostname: host,
    path: path,
    method: method,
    headers: headers,
    rejectUnauthorized: false // TODO make this configurable. used because apigee doesn't generate certs properly
  }
  if (addressParts.length > 2)
    options.port = addressParts[2]
  log('sendExternalRequestThen', `method: ${method} address: ${address} path: ${path}`)
  var clientReq
  if (useHttps)
    clientReq = https.request(options, callback)
  else
    clientReq = http.request(options, callback)
  clientReq.on('error', function (err) {
    log('sendExternalRequestThen', `sendHttpRequest: error ${err}`)
    rLib.internalError(res, {err:err})
  })
  if (body) clientReq.write(body)
  clientReq.end()
}

function ifAuditShowsChange(res, clientToken, orgName, orgURL, lastMigrationTime, callback) {
  var parts = url.parse(orgURL)
  var address = `${parts.protocol}//${parts.host}`
  var auditPath = `/v1/audits/organizations/${orgName}/userroles?expand=true&endTime=${lastMigrationTime}`
  var clientHeaders = {}
  clientHeaders['Accept'] = 'application/json'
  clientHeaders['Content-Type'] = 'application/json'
  clientHeaders.authorization = 'Bearer ' + clientToken
  sendExternalRequestThen(res, clientHeaders, address, auditPath, 'GET', null, function(clientRes) {
    lib.getClientResponseBody(clientRes, function(body) {
      log('ifAuditShowsChange:', `statusCode: ${clientRes.statusCode} address: ${address} auditPath: ${auditPath} body: ${JSON.stringify(body)}`)
      callback()
    })
  })
}

function remigrateOnSchedule() {
  var now = Date.now()
  var res = rLib.errorHandler(function(result) {
    log('remigrateOnSchedule', `unable to remigrate. statuscode: ${result.statusCode} headers: ${result.headers} body: ${JSON.stringify(result.body)}`)
  })
  db.getMigrationsOlderThan(now - (REMIGRATION_INTERVAL / SPEEDUP), function(err, migrations) {
    if (err == null)
      for (let i=0; i<migrations.length; i++) {
        var migration = migrations[i]
        var orgName = migration.data.orgName
        var lastMigrationTime = migration.starttime
        var orgURL = migration.orgurl
        var issuer = migration.data.issuer
        withClientCredentialsDo(res, issuer, function(clientToken) {         
          ifAuditShowsChange(res, clientToken, orgName, orgURL, lastMigrationTime, function() {
            var requestBody = {resource: orgURL}
            var res = rLib.errorHandler(function(result) {
              if (result.statusCode == 200)
                log('remigrateOnSchedule', `successfully remigrated org named ${orgName} url ${orgURL}`)
              else
                log('remigrateOnSchedule', `failed to remigrate. statusCode: ${result.statusCode} headers: ${result.headers} body: ${result.body}`)
            })
            handleReMigration(res, issuer, clientToken, requestBody)
          })
        })
      }
    else
      log('remigrateOnSchedule', `failed to remigrate. err: ${JSON.stringify(err)}`)    
  })
}

function requestHandler(req, res) {
  if (req.url.startsWith('/az-permissions-migration/migration-request')) 
    if (req.method == 'POST')
      lib.getServerPostObject(req, res, (x) => handleMigrationRequest(req, res, x))
    else
      rLib.methodNotAllowed(res, ['POST'])
  else if (req.url.startsWith('/az-permissions-migration/re-migration-request'))
    if (req.method == 'POST')
      lib.getServerPostObject(req, res, (x) => handleReMigrationRequest(req, res, x))
    else
      rLib.methodNotAllowed(res, ['POST'])
  else
    rLib.notFound(res, `//${req.headers.host}${req.url} not found`)
}

function init(callback, aPool) {
  db.init(callback, aPool)
}

var port = process.env.PORT
function run() {
  init(function () {
    http.createServer(requestHandler).listen(port, function () {
      log('start', `server is listening on ${port}`)
    })
    setInterval(remigrateOnSchedule, REMIGRATION_CHECK_INTERVAL / SPEEDUP)
  })
}

function start() {
  if (require.main === module)
    run()
  else
    module.exports = {
      requestHandler:requestHandler,
      paths: ['/az-permissions-migration/migration-request', '/az-permissions-migration/re-migration-request'],
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
