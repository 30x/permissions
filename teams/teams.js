'use strict'
const http = require('http')
const url = require('url')
const lib = require('http-helper-functions')
const db = require('./teams-db.js')
const pLib = require('permissions-helper-functions')
const rLib = require('response-helper-functions')

const TEAM_PREFIX = '/az-tm-'
const TEAMS = '/az-teams/'
const COMPONENT_NAME = 'teams'

const PERMISSIONS_CLIENTID = process.env.PERMISSIONS_CLIENTID
const PERMISSIONS_CLIENTSECRET = process.env.PERMISSIONS_CLIENTSECRET
const AUTH_URL = process.env.CLIENT_TOKEN_ISSUER + '/oauth/token'
var PERMISSIONS_CLIENT_TOKEN

if (PERMISSIONS_CLIENTID == null || PERMISSIONS_CLIENTSECRET == null || AUTH_URL == null) {
  console.log(PERMISSIONS_CLIENTID == null ? 'PERMISSIONS_CLIENTID must be set' : PERMISSIONS_CLIENTSECRET == null ? 'PERMISSIONS_CLIENTSECRET must be set' : 'AUTH_URL must be set')
  process.exit(-1)
}

function log(functionName, text) {
  console.log(Date.now(), COMPONENT_NAME, functionName, text)
}

function verifyBases(req, res, team, callback) {
  var bases = Object.keys(team.role)
  var pathCount
  var count = 0
  var notAllowed = []
  for (let i=0; i<bases.length; i++) {
    var base = bases[i]
    var paths = Object.keys(base)
    pathCount += path.length
    for (let j=0; j< paths.length; j++)
      pLib.withAllowedDo(lib.flowThroughHeaders(req), res, base, '_self', 'govern', base, paths[j], function(allowed) {
        if (!allowed) 
          notAllowed.push(bases[i])
        if (++count == pathCount)
          callback(notAllowed.length == 0 ? null : `user ${lib.getUser(req.headers.authorization)} does not have the right to administer the permissions of the following base resources: ${notAllowed}`)            
      })
  }
  if (pathCount == 0)
    calback(null)
}

function verifyTeam(req, res, team, callback) {
  var user = lib.getUser(req.headers.authorization)
  var rslt = lib.setStandardCreationProperties(req, team, user)
  if (team.isA == 'Team')
    if (Array.isArray(team.members))
      if (team.role !== undefined) 
        verifyBases(req, res, team, callback)
      else
        callback(null)
    else
      callback({msg: 'team must have an array of members'})
  else
    callback({msg: 'invalid JSON: "isA" property not set to "Team"', body: team})
}

function createTeam(req, res, team) {
  pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, '/', 'teams', 'create', function() {
    verifyTeam(req, res, team, function(err) { 
      if (err !== null) 
        rLib.badRequest(res, err)
      else {
        var id = rLib.uuidw()
        var selfURL = makeSelfURL(req, id)
        var permissions = team._permissions
        if (permissions !== undefined) {
          delete team._permissions; // unusual case where ; is necessary
          (new pLib.Permissions(permissions)).resolveRelativeURLs(selfURL)
        }
        var headers = lib.flowThroughHeaders(req)
        lib.withValidClientToken(res, PERMISSIONS_CLIENT_TOKEN, PERMISSIONS_CLIENTID, PERMISSIONS_CLIENTSECRET, AUTH_URL, function(newToken) {
          if (newToken)
            PERMISSIONS_CLIENT_TOKEN = newToken
          headers['x-client-authorization'] = `Bearer ${PERMISSIONS_CLIENT_TOKEN}`
          pLib.createPermissionsThen(headers, res, selfURL, permissions, function(err, permissionsURL, permissions, responseHeaders){
            // Create permissions first. If we fail after creating the permissions resource but before creating the main resource, 
            // there will be a useless but harmless permissions document.
            // If we do things the other way around, a team without matching permissions could cause problems.
            db.createTeamThen(req, res, id, selfURL, team, permissions.scopes, function(etag) {
              team.self = selfURL 
              addCalculatedProperties(team)
              rLib.created(res, team, req.headers.accept, team.self, etag)
            })
          })
        })
      }
    })
  })
}

function makeSelfURL(req, key) {
  return `${rLib.INTERNAL_URL_PREFIX}${TEAM_PREFIX}${key}`
}

function addCalculatedProperties(team) {
  var externalSelf = lib.externalizeURLs(team.self)
  team._permissions = `${rLib.INTERNAL_URL_PREFIX}/az-permissions?${externalSelf}`
  team._permissionsHeirs = `${rLib.INTERNAL_URL_PREFIX}/az-permissions-heirs?${externalSelf}`  
}

function getTeam(req, res, id) {
  pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, req.url, '_self', 'read', function(err, reason) {
    db.withTeamDo(req, res, id, function(team , etag) {
      team.self = makeSelfURL(req, id)
      addCalculatedProperties(team)
      rLib.found(res, team, req.headers.accept, team.self, etag)
    })
  })
}

function deleteTeam(req, res, id) {
  pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, req.url, '_self', 'delete', function() {
    db.deleteTeamThen(req, res, id, makeSelfURL(req, id), function (team, etag) {
      pLib.deletePermissionsThen(lib.flowThroughHeaders(req), res, `${TEAM_PREFIX}${id}`, function () {
        console.log(`deleted permissions for ${TEAM_PREFIX}${id}`)
      })
      team.self = makeSelfURL(req, id)
      addCalculatedProperties(team)
      rLib.found(res, team, req.headers.accept, team.self, etag)
    })
  })
}

function patchTeam(req, res, id, patch) {
  var selfURL =  makeSelfURL(req, id) 
  pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, req.url, '_self', 'update', function(allowed) {
    db.withTeamDo(req, res, id, function(team , etag) {
      if (req.headers['if-match'] == etag) { 
        lib.applyPatch(req.headers, res, team, patch, function(patchedTeam) {
          verifyTeam(req, res, patchedTeam, function(err) {
            if (err)
              rLib.badRequest(res, err)
            else
              db.updateTeamThen(req, res, id, makeSelfURL(req, id), patchedTeam, allowed.scopes, etag, function (etag) {
                patchedTeam.self = selfURL 
                addCalculatedProperties(patchedTeam)
                rLib.found(res, patchedTeam, req.headers.accept, patchedTeam.self, etag)
              })
          })
        })
      } else {
        var err = (req.headers['if-match'] === undefined) ? 'missing If-Match header' : 'If-Match header does not match etag ' + req.headers['If-Match'] + ' ' + etag
        rLib.preconditionFailed(res, err)
      }
    })
  }, true)
}

function putTeam(req, res, id, team) {
  pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, req.url, '_self', 'put', function(allowed) {
    verifyTeam(req, res, team, function(err) {
      if (err)
        rLib.badRequest(res, err)
      else
        db.updateTeamThen(req, res, id, makeSelfURL(req, id), team, allowed.scopes, null, function (etag) {
          team.self = makeSelfURL(req, id) 
          addCalculatedProperties(team)
          rLib.found(res, team, req.headers.accept, team.self, etag)
        })
    })
  }, true)
}

function getTeamsForUser(req, res, user) {
  var requestingUser = lib.getUser(req.headers.authorization)
  user = lib.internalizeURL(user, req.headers.host)
  if (user == requestingUser) {
    db.withTeamsForUserDo(req, res, user, function (teamIDs) {
      var rslt = {
        self: req.url,
        contents: teamIDs.map(id => `//${req.headers.host}${TEAM_PREFIX}${id}`)
      }
      rLib.found(res, rslt, req.headers.accept, rslt.self)
    })
  } else
    rLib.forbidden(res)
}

function getTeamsMisc(req, res) {
  pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, req.url, '_self', 'read', function(err, reason) {
    db.withTeamMiscDo(req, res, req.url, function(misc , etag) {
      misc.self = req.url
      rLib.found(res, misc, req.headers.accept, misc.self, etag)
    })
  })  
}

function patchTeamsMisc(req, res, patch, verifier) {
  pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, req.url, '_self', 'update', function() {
    db.withTeamMiscDo(req, res, req.url, function(misc) {
      lib.applyPatch(req.headers, res, misc, patch, function(patchedMisc) {
        verifier(patchedMisc, function(err) {
          if (err)
            rLib.badRequest(res, err)
          else
            db.updateTeamMiscThen(req, res, req.url, patchedMisc, function () {
              patchedMisc.self = req.url 
              rLib.found(res, patchedMisc, req.headers.accept, patchedMisc.self)
            })
        })
      })
    })
  })
}

function verifyWellKnownTeams(wellKnownTeams, callback) {
  callback()
}

function requestHandler(req, res) {
  if (req.url == '/az-teams') 
    if (req.method == 'POST') 
      lib.getServerPostObject(req, res, team => createTeam(req, res, team))
    else 
      rLib.methodNotAllowed(res, ['POST'])
  else if (req.url == '/az-well-known-teams')
    if (req.method == 'GET')
      getTeamsMisc(req, res)
    else if (req.method == 'PATCH')
      lib.getServerPostObject(req, res, patch => patchTeamsMisc(req, res, patch, verifyWellKnownTeams))
    else 
      rLib.methodNotAllowed(res, ['GET', 'PATCH'])
  else {
    var req_url = url.parse(req.url)
    if (req_url.pathname.startsWith(TEAM_PREFIX)) {
      var id = req_url.pathname.substring(TEAM_PREFIX.length)
      if (req.method == 'GET')
        getTeam(req, res, id)
      else if (req.method == 'DELETE') 
        deleteTeam(req, res, id)
      else if (req.method == 'PATCH') 
        lib.getServerPostObject(req, res, (jso) => patchTeam(req, res, id, jso))
      else if (req.method == 'PUT') 
        lib.getServerPostObject(req, res, (jso) => putTeam(req, res, id, jso))
      else
        rLib.methodNotAllowed(res, ['GET', 'DELETE', 'PATCH', 'PUT'])
    } else if (req_url.pathname == '/az-teams' && req_url.search !== null)
      getTeamsForUser(req, res, req_url.search.substring(1))
    else
      rLib.notFound(res, {msg: `//${req.headers.host}${req.url} not found`, component: 'teams'})
  }
}

function init(callback, aPool) {
  db.init(callback, aPool)
}

function run(){
  init(function(){
    var port = process.env.PORT
    http.createServer(requestHandler).listen(port, function() {
      console.log(`server is listening on ${port}`)
    })
  })
}

function start() {
  if (require.main === module) 
    run()
  else
    module.exports = {
      requestHandler:requestHandler,
      paths: ['/az-teams', '/az-well-known-teams', '/az-tm-'],
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
