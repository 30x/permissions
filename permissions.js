'use strict'
const http = require('http')
const lib = require('http-helper-functions')
const rLib = require('response-helper-functions')
const db = require('./permissions-pg.js')
const querystring = require('querystring')
const url = require('url')
const pge = require('pg-event-consumer')

const ANYONE = 'http://apigee.com/users#anyone'
const INCOGNITO = 'http://apigee.com/users#incognito'

const TEAMS = '/teams/'

const PERMISSIONS_CACHE_NUMBER_OF_SHARDS = process.env.PERMISSIONS_CACHE_NUMBER_OF_SHARDS || 10
const CACHE_ENTRY_TTL = process.env.CACHE_ENTRY_TTL || 60*60*1000
const CACHE_SWEEP_INTERVAL = process.env.CACHE_SWEEP_INTERVAL || 10*60*1000
const SPEEDUP = process.env.SPEEDUP || 1

// The permissions cache is sharded, which allows individual shards to be scavenged independently when implementing TTL. 
// This might be overkill, but it's oly a few lines of code. Take them out if you don't like it.
var permissionsCache = Array(PERMISSIONS_CACHE_NUMBER_OF_SHARDS) // key is permissions subject URL, value is permissions object
var nextPermissionsCacheShard = 0
var actorsForUserCache = {} // key is User's URL, value is array of URLS
var teamsCache = {} // key is team URL, value is roles object whose keys are 'base URLs'

function hash(str) {
  var hash = 5381,
      i    = str.length
  while(i)
    hash = (hash * 33) ^ str.charCodeAt(--i)
  return hash >>> 0
}

function addToPermissionsCache(resource, permissions, etag) {
  var shard = hash(resource) % PERMISSIONS_CACHE_NUMBER_OF_SHARDS
  if (permissionsCache[shard] === undefined)
    permissionsCache[shard] = {}
  if (permissions === null)
    permissionsCache[shard][resource] = null
  else {
    if (etag)
      permissions._Etag = etag
    permissions._metadata = null
    permissions.lastAccess = Date.now()
    permissionsCache[shard][resource] = permissions
  }
}

function retrieveFromPermissionsCache(resource) {
  var shard = hash(resource) % PERMISSIONS_CACHE_NUMBER_OF_SHARDS
  var permissions = permissionsCache[shard] === undefined ? undefined : permissionsCache[shard][resource]
  if (permissions)
    permissions.lastAccess = Date.now()
  return permissions
}

function deleteFromPermissionsCache(resource) {
  var shard = hash(resource) % PERMISSIONS_CACHE_NUMBER_OF_SHARDS
  if (permissionsCache[shard] !== undefined)
    delete permissionsCache[shard][resource]
}

function resetPermissionsCache() {
  permissionsCache = Array(PERMISSIONS_CACHE_NUMBER_OF_SHARDS)
}

function invalidateCachedUsers(teamURL, team) {
  // We cache both teams and the list of teams for a user. These caches must be coherent. If an old cached entry is invalidated, then all the cache
  // entries for its member users are also invalid.
  var existingTeam = retrieveFromTeamsCache(teamURL)
  var beforeMembers = existingTeam !== undefined ? existingTeam.members : []
  var afterMembers = team !== undefined ? team.members : []
  for (let i = 0; i < beforeMembers.length; i++)
    if (afterMembers.indexOf(beforeMembers[i]) == -1)
      delete actorsForUserCache[beforeMembers[i]]
  for (let i = 0; i < afterMembers.length; i++)
    if (beforeMembers.indexOf(afterMembers[i]) == -1)
      delete actorsForUserCache[afterMembers[i]]    
}

function addToTeamsCache(teamURL, team) {
  invalidateCachedUsers(teamURL, team)
  team.lastAccess = Date.now()
  teamsCache[teamURL] = team
}

function retrieveFromTeamsCache(teamURL) {
  var team = teamsCache[teamURL]
  if (team)
    team.lastAccess = Date.now()
  return team
}

function deleteFromTeamsCache(teamURL) {
  invalidateCachedUsers(teamURL)
  delete teamsCache[teamURL]
}

function resetTeamsCache() {
  actorsForUserCache = {}
  teamsCache = {}
}

function log(method, text) {
  console.log(Date.now(), process.env.COMPONENT_NAME, method, text)
}

function scanNextPermissionsCacheShard(ageLimit) {
  var shard = permissionsCache[nextPermissionsCacheShard]
  nextPermissionsCacheShard = (nextPermissionsCacheShard + 1) % PERMISSIONS_CACHE_NUMBER_OF_SHARDS
  if (shard)
    for (var resource in shard) {
      var permissions = shard[resource]
      if (permissions)
        if (ageLimit > permissions.lastAccess)
          delete shard[resource]
    }
}

function scanTeamsCache(ageLimit) {
  console.log('scanning teams cache')
  for (var teamURL in teamsCache) {
    var team = teamsCache[teamURL]
    if (team)
      if (ageLimit > team.lastAccess)
        deleteFromTeamsCache(teamURL)
  }
}

function implementTTL() {
  var ageLimit = Date.now() - CACHE_ENTRY_TTL / SPEEDUP
  if (nextPermissionsCacheShard % PERMISSIONS_CACHE_NUMBER_OF_SHARDS == 0)
    scanTeamsCache(ageLimit)
  scanNextPermissionsCacheShard(ageLimit)
}

setInterval(implementTTL, CACHE_SWEEP_INTERVAL / PERMISSIONS_CACHE_NUMBER_OF_SHARDS / SPEEDUP)

function getAllowedActions(req, res, queryString) {
  var queryParts = querystring.parse(queryString)
  var resource = queryParts.resource
  if (resource !==undefined)
    resource = lib.internalizeURL(resource, req.headers.host)
  var user = queryParts.user
  var path = queryParts.path
  var base = queryParts.base
  var property = queryParts.property || '_self'
  log('getAllowedActions', `resource: ${resource} user: ${user} property: ${property} base: ${base} path: ${path}`)
  if (user == lib.getUser(req.headers.authorization)) 
    withAllowedActionsDo(req, res, resource, property, user, base, path, function(allowedActions) {
      rLib.found(res, allowedActions, req.headers.accept, req.url)
    })
  else
    rLib.forbidden(res, 'user in query string must match user credentials', req.headers.accept, req.url)
}

function collateAllowedActions(permissionsObject, property, actors) {
  permissionsObject = permissionsObject[property]
  if (permissionsObject !== undefined) {
    var allowedActions = {}
    for (var action in permissionsObject) {
      var allowedActors = permissionsObject[action]
      if (allowedActors !== undefined)
        if (allowedActors.indexOf(INCOGNITO) > -1)  
          allowedActions[action] = true
        else if (actors !== null) 
          if (allowedActors.indexOf(ANYONE) > -1) 
            allowedActions[action] = true       
          else if (allowedActors.indexOf(allowedActors[0].split('#')[0] + '#anyone') > -1)
            allowedActions[action] = true
          else
            for (var j=0; j<actors.length; j++) {
              var user = actors[j]
              if (allowedActors.indexOf(user) > -1 )
                allowedActions[action] = true
            }
    }
  }
  return allowedActions
}

function isActionAllowed(permissionsObject, property, actors, action) {
  //log('isActionAllowed', `_subject: ${permissionsObject._subject} property: ${property} action: ${action} actors: ${actors}`)
  if (permissionsObject._constraints && permissionsObject._constraints.validIssuers) // only users validated with these issuers allowed
    if (actors.length == 0 || permissionsObject._constraints.validIssuers.indexOf(actors[0].split('#')[0]) < 0) // user's issuer not in the list
      return false
  var propertyPermissions = permissionsObject[property]
  if (propertyPermissions !== undefined) {
    var allowedActors = propertyPermissions[action]
    if (allowedActors !== undefined) {
      if (allowedActors.indexOf(INCOGNITO) > -1)
        return true
      else if (actors !== null)
        if (allowedActors.indexOf(ANYONE) > -1)
          return true
        else if (allowedActors.indexOf(allowedActors[0].split('#')[0] + '#anyone') > -1) // first entry in allowedActors is the user
          return true
        else 
          for (var j=0; j<actors.length; j++) {
            var actor = actors[j]
            if (allowedActors.indexOf(actor) > -1 )
              return true
          }
    }
  }
  // if we get this far, we have not been able to say definiitively yes
  if (permissionsObject._constraints && permissionsObject._constraints.wideningForbidden)
    return false // the answer is no
  else
    return null // see if anyone else will say yes
}

function withPermissionsDo(req, res, resource, callback, errorCallback) {
  var permissions = retrieveFromPermissionsCache(resource)
  if (permissions != undefined && permissions !== null) {
    callback(permissions)
  } else {
    function checkResult(err, permissions, etag) {
      if (err == 404)
        addToPermissionsCache(resource, null)
      if (err)
        if (errorCallback !== undefined)
          errorCallback(err)
        else
          if (err == 404)
            rLib.notFound(res, `//${req.headers.host}${req.url} not found`)
          else
            rLib.internalError(res, err)          
      else {
        addToPermissionsCache(resource, permissions, etag)
        callback(permissions, etag)
      }      
    }
    if (permissions === null) // we checked before — it's not there
      checkResult(404)
    else
      db.withPermissionsDo(req, resource, function(err, permissions, etag) {
        if (err == 404)
          lib.sendInternalRequestThen(res, 'POST', '/permissions-migration/migration-request', lib.flowThroughHeaders(req), JSON.stringify({resource: resource}), function(clientResponse) {
            if (clientResponse.statusCode = 200)
              db.withPermissionsDo(req, resource, function(err, permissions, etag) {
                checkResult(err, permissions, etag)
              })
            else
            rLib.notFound(res, `//${req.headers.host}${req.url} not found`)
          })
        else 
          checkResult(err, permissions, etag)
      })
  }
}

function withAncestorPermissionsDo(req, res, subject, itemCallback, finalCallback, errorCallback) {
  var recursionSet = {}
  function ancestors(resource, callback) {
    withPermissionsDo(req, res, resource, function(permissions) {
      var stopHere = itemCallback(permissions)
      if (stopHere) 
        callback(stopHere)
      else {
        var inheritsPermissionsOf = permissions._inheritsPermissionsOf
        if (inheritsPermissionsOf !== undefined) {
          inheritsPermissionsOf = inheritsPermissionsOf.filter(x => !(x in recursionSet))
          if (inheritsPermissionsOf.length > 0) {
            var count = 0
            var replied = false
            for (var j = 0; j < inheritsPermissionsOf.length; j++) {
              recursionSet[inheritsPermissionsOf[j]] = true 
              ancestors(inheritsPermissionsOf[j], function(stopped) {
                if (stopped || ++count == inheritsPermissionsOf.length) 
                  if (!replied) {
                    replied = true
                    callback(stopped)
                  }
              })
            }
          } else
            callback()
        } else
          callback()
      }
    }, errorCallback)
  }
  ancestors(subject, finalCallback)
}

function sortAndSplitRoles(roles) {
  function roleSortFunction(path1, path2) {
    var result = path2.length - path1.length
    if (result == 0)
      result += (0.5 * (path2[path2.length-1] != '*') - 0.5 * (path1[path1.length-1] != '*'))
    return result
  }
  if (roles !== undefined)
    for (var base in roles) {
      var sortedSplitPaths = Object.keys(roles[base]).map(x => x.split('/')).sort(roleSortFunction)
      roles[base] = sortedSplitPaths.map(splitPath => {return {path: splitPath, actions: roles[base][splitPath.join('/')]}})
    }
}

function withActorsForUserDo(req, res, user, callback) {
  if (user !== null) {
    var actors = actorsForUserCache[user] 
    if (actors !== undefined)
      callback(actors)
    else {  
      user = lib.internalizeURL(user, req.headers.host)
      db.withTeamsForUserDo(req, user, function(err, rows) {
        if (err)
          rLib.internalError(res, err)
        else {
          // We cache both teams and the list of teams for a user. These caches must be coherent.
          var actors = [user]
          for (let i = 0; i < rows.length; i++) {
            var teamURL = `${TEAMS}${rows[i].id}`
            var team = rows[i].data
            team.self = teamURL
            team.etag = rows[i].etag 
            sortAndSplitRoles(team.roles)
            addToTeamsCache(teamURL, team)
            actors.push(teamURL)
          }
          actorsForUserCache[user] = actors  
          callback(actors)
        }
      })
    }
  } else
    rLib.badRequest(res, 'user must be provided' + req.url)
}

function pathPatternMatch(pathPatternParts, pathParts) {
  for (var j=0; j < pathPatternParts.length && j < pathParts.length; j++) {
    var patternSegement = pathPatternParts[j]
    if (patternSegement != '*' && patternSegement != pathParts[j])
      return false
  }
  return true
}

function calculateRoleActions(roles, base, pathParts) {
  if (roles != null && base in roles) {
    var role = roles[base]
    for (var i=0; i<role.length; i++)
      if (pathPatternMatch(role[i].path, pathParts))
        return role[i].actions
  }
  return null
}

function withPermissionFlagDo(req, res, subject, property, action, base, path, withScopes, callback) {
  function calculateFlagForActors (actors) {  
    function checkRoles(answer, scopes) {
      for (let i = 1; i < actors.length && answer === null ; i++) {
        var roles = retrieveFromTeamsCache(actors[i]).roles // touching the teamsCache will keep entry alive
        if (answer === null && base != null && path != null) {
          var actions = calculateRoleActions(roles, base, path.split('/'))
          if (actions !== null && actions.indexOf(action) > -1)
            answer = true
        }
      }  
      callback(answer, scopes)
    }
    var allowed = null
    var scopes = withScopes ? [] : undefined
    if (subject === undefined)
      checkRoles(null, scopes)
    else
      withAncestorPermissionsDo(req, res, subject, function(permissions) {
        if (withScopes)
          scopes.push(permissions._subject)
        var opinion = isActionAllowed(permissions, property, actors, action)
        if (opinion == true) { // someone says its OK, but there may be  a veto later
          allowed = allowed == null && true
          return false // keep going
        } else if (opinion == false) {
          allowed = false
          return !withScopes  // operation is forbidden. Stop looking unless we need to return the hierarchy
        } else
          return false // keep going
      }, function() {
        checkRoles(allowed, scopes)
      }, function(err) {
        if (err == 404)
          checkRoles(null, scopes)
        else
          lib.internalError(res, err)              
      })
  }
  var actors
  var user = lib.getUser(req.headers.authorization)
  if (user == null)
    calculateFlagForActors([])
  else {
    withActorsForUserDo(req, res, user, function(actors) {
      calculateFlagForActors(actors)
    })
  }
}

function withAncestorPermissionsTreeDo(req, res, subject, callback, errorCallback) {
  var recursionSet = {}
  var tree = []
  function withAncestorPermissionsSubtreeDo(resource, tree, callback, errCallback) {
    withPermissionsDo(req, res, resource, function(permissions) {
      tree[0] = permissions
      var inheritsPermissionsOf = permissions._inheritsPermissionsOf
      if (inheritsPermissionsOf !== undefined) {
        inheritsPermissionsOf = inheritsPermissionsOf.filter(x => !(x in recursionSet))
        if (inheritsPermissionsOf.length > 0) {
          var count = 0
          for (var j = 0; j < inheritsPermissionsOf.length; j++) {
            recursionSet[inheritsPermissionsOf[j]] = true 
            tree[j+1] = []
            withAncestorPermissionsSubtreeDo(inheritsPermissionsOf[j], tree[j+1], function(subtree) {
              if (++count == inheritsPermissionsOf.length) 
                callback(tree)
            })
          }
        } else
          callback(tree)
      } else
        callback(tree)
    }, errCallback)
  }
  withAncestorPermissionsSubtreeDo(subject, tree, callback, errorCallback)
}

function withAllowedActionsDo(req, res, resource, property, user, base, path, callback) {
  withActorsForUserDo(req, res, user, function(actors) {
    function calculateAllRoleActions(actions) {
      if (base && path) {
        var pathParts = path.split('/')
        for (let i=1; i<actors.length; i++) {
          var roles = retrieveFromTeamsCache(actors[i]).roles
          if (roles != null) {
            var roleActions = calculateRoleActions(roles, base, pathParts)
            if (roleActions !== null)
              for (let i = 0; i < roleActions.length; i++)
                actions[roleActions[i]] = true
          }
        }
      }
      callback(Object.keys(actions))
    }
    if (resource === undefined)
      calculateAllRoleActions({})
    else
      withAncestorPermissionsTreeDo(req, res, resource, function(tree) {
        var entityCalculations = calculateEntityActions(tree, actors)
        var entityActions = Object.keys(entityCalculations[0])
        var wideningForbidden = entityCalculations[1]
        if (wideningForbidden || actors.length <=1 || path === undefined || base === undefined)
          callback(entityActions)
        else 
          calculateAllRoleActions(entityActions)
      }, function(err) {
        if (err == 404)
          calculateAllRoleActions({})
        else
          rLib.internalError(res, err) 
      }) 
  })
  function calculateEntityActions(node, actors) {
    var permissions = node[0]
    if (permissions._constraints && permissions._constraints.validIssuers) // only users validated with these issuers allowed
      if (actors.length == 0 || permissions._constraints.validIssuers.indexOf(actors[0].split('#')[0]) < 0) { // user's issuer not in the list
        return [[], true]
      }
    var actions = {}
    var wideningForbidden = false
    for (var i = 1; i < node.length; i++) {
      var [ancestorActions, ancestorWideningForbidden] = calculateEntityActions(node[i], actors)
      if (ancestorWideningForbidden)
        if (wideningForbidden) 
          for (var key in actions) {
            if (!key in ancestorActions)
              delete actions[key]
          }
        else 
          actions = ancestorActions
      else
        if (!wideningForbidden)
          Object.assign(actions, ancestorActions)
      wideningForbidden = wideningForbidden || ancestorWideningForbidden
    }
    if (!wideningForbidden)
      Object.assign(actions, collateAllowedActions(permissions, property, actors))
    return [actions, wideningForbidden || (permissions._constraints !== undefined && permissions._constraints.wideningForbidden)]
  }
}

function isAllowed(req, res, queryString) {
  var hrstart = process.hrtime()
  var queryParts = querystring.parse(queryString)
  var user = queryParts.user
  var action = queryParts.action
  var property = queryParts.property || '_self'
  var path = queryParts.path
  var base = queryParts.base
  var withScopes = queryParts.withScopes == '' || queryParts.withScopes
  var resources = Array.isArray(queryParts.resource) ? queryParts.resource : [queryParts.resource]
  if (queryParts.resource !== undefined) 
    resources = resources.map(x => lib.internalizeURL(x, req.headers.host))
  log('isAllowed', `user: ${user} action: ${action} property: ${property} resources: ${resources} base: ${base} path: ${path} withScopes: ${withScopes}`)
  var allScopes
  function response(answer) {
    return withScopes ? {allowed: answer, scopes: Array.from(new Set(allScopes))} : answer
  }
  if (user == null || user == lib.getUser(req.headers.authorization))
    if (action === undefined)
      rLib.badRequest(res, 'action query parameter must be provided: ' + req.url)
    else {
      var count = 0
      var responded = false
      for (var i = 0; i< resources.length; i++) { // multiple resources is interpreted to mean that the user must have access to all of them. A different API that answers "any of them" might be useful.
        if (!responded)
          withPermissionFlagDo(req, res, resources[i], property, action, base, path, withScopes, function(answer, scopes) {
            if (withScopes)
              allScopes = allScopes ? allScopes.concat(scopes) : scopes
            if (!responded) {
              if (++count == resources.length) {
                rLib.found(res, response(answer), req.headers.accept, req.url)  // answer will be true (allowed), false (forbidden) or null (no informaton, which means no)
                responded = true
                var hrend = process.hrtime(hrstart)
                log('isAllowed', `success, time: ${hrend[0]}s ${hrend[1]/1000000}ms answer: ${answer} resources: ${resources}`)
              } else if (answer != true) {
                rLib.found(res, response(answer), req.headers.accept, req.url)
                responded = true
                var hrend = process.hrtime(hrstart)
                log('isAllowed', `success, time: ${hrend[0]}s ${hrend[1]/1000000}ms answer: ${answer} resources: ${resources}`)
              }
            }
          })
      }
    } 
  else  
    rLib.forbidden(res)
}

function isAllowedToInheritFrom(req, res, queryString) {
  function withExistingAncestorsDo(resource, callback) {
    var ancestors = []
    if (resource)
      withAncestorPermissionsDo(req, res, resource, function(permissions) {
        if (permissions._subject != resource)
          ancestors.push(permissions._subject)
      }, function(){
        callback(Array.from(new Set(ancestors)))
      })
    else
      callback(ancestors)
  }
  function withPotentialAncestorsDo(ancestors, callback) {
    if (ancestors.length == 0) 
      callback([])
    else {
      var allAncestors = ancestors.slice()
      var count = 0
      for (var i = 0; i < ancestors.length; i++)
        withAncestorPermissionsDo(req, res, ancestors[i], function(permissions) {
          allAncestors.push(permissions._subject)
        }, function(){
          if (++count == ancestors.length)
            callback(Array.from(new Set(allAncestors)))
        })
    }      
  }
  function checkPotentialAncestors(existingAncestors, sharingSets) {    
    withPotentialAncestorsDo(sharingSets, function (potentialAncestors) {
      // The algorithm here is a bit different from the usual permissions inheritance lookup. In the usual case
      // we are considering a single action, and going up the hierarchy to find a permission that allows it. In this case
      // we consider that we are doing an add or remove at every level, so we are going up the hierarchy multiple times,
      // once for each add or remove at each level of the hierarchy.
      function positiveResult() {
        return {allowed: true, scopes: Array.from(new Set(existingAncestors.concat(potentialAncestors)))}
      }
      if (potentialAncestors.indexOf(subject) == -1) {
        var addedAncestors = potentialAncestors.filter(x=>existingAncestors.indexOf(x) == -1)
        var removedAncestors = existingAncestors.filter(x=>potentialAncestors.indexOf(x) == -1)
        var responded = false
        var addOK = addedAncestors.length == 0
        var removeOK = removedAncestors.length == 0
        if (removedAncestors.length > 0) {
          let count = 0
          for (let i=0; i < removedAncestors.length; i++)
            withPermissionFlagDo(req, res, removedAncestors[i], '_permissionsHeirs', 'remove', null, null, false, function(answer) {
              if (!responded) 
                if (!answer) {
                  responded = true
                  rLib.found(res, {allowed: false, reason: `may not remove permissions inheritance from ${removedAncestors[i]}`}, req.headers.accept, req.url) 
                } else
                  if (++count == removedAncestors.length) {
                    removeOK = true
                    if (addOK) {
                      responded = true
                      rLib.found(res, positiveResult(), req.headers.accept, req.url)
                    }
                  }
            })
        }
        if (addedAncestors.length > 0) {
          let count = 0
          for (let i=0; i < addedAncestors.length; i++) 
            withPermissionFlagDo(req, res, addedAncestors[i], '_permissionsHeirs', 'add', null, null, false, function(answer) {
              if (!responded)
                if (!answer) {
                  responded = true
                  rLib.found(res, {result: false, reason: `may not add permissions inheritance to ${addedAncestors[i]}`}, req.headers.accept, req.url) 
                } else
                  if (++count == addedAncestors.length) {
                    addOK = true
                    if (removeOK) {
                      responded = true
                      rLib.found(res, positiveResult(), req.headers.accept, req.url)
                    }
                  }
            })
        }
        if (removedAncestors.length == 0 && addedAncestors.length == 0)
          rLib.found(res, positiveResult(), req.headers.accept, req.url)
      } else
        rLib.found(res, {result: false, reason: `may not add cycle to permisions inheritance`}, req.headers.accept, req.url) // cycles not allowed
    })
  }
  var queryParts = querystring.parse(queryString)
  var subject = queryParts.subject
  var sharingSet = queryParts.sharingSet || []
  var sharingSets = (Array.isArray(sharingSet) ? sharingSet : [sharingSet]).map(anURL => lib.internalizeURL(anURL, req.headers.host))
  if (subject === undefined) 
    checkPotentialAncestors([], sharingSets)
  else {
    subject = lib.internalizeURL(subject, req.headers.host)
    withPermissionFlagDo(req, res, subject, '_self', 'admin', null, null, false, function(answer) {
      if (answer)
        withExistingAncestorsDo(subject, function(existingAncestors) {
          checkPotentialAncestors(existingAncestors, sharingSets)
        })
      else
        rLib.forbidden(res)
    })
  }
}

function processEvent(event) {
  if (event.topic == 'eventGapDetected') {
    log('processEvent', 'event.topic: eventGapDetected')
    resetPermissionsCache()
    resetTeamsCache()
  } else if (event.topic == 'permissions')
    if (event.data.action == 'deleteAll') {
      log('processEvent', `event.index: ${event.index} event.topic: ${event.topic} event.data.action: deleteAll`)
      resetPermissionsCache()
    } else {
      log('processEvent', `event.index: ${event.index} event.topic: ${event.topic} event.data.action: ${event.data.action} subject: ${event.data.subject}`)
      deleteFromPermissionsCache(event.data.subject)
    }
  else if (event.topic == 'teams') {
    log('processEvent', `event.index: ${event.index} event.topic: ${event.topic} event.data.action: ${event.data.action} event.data.url: ${event.data.url}`)
    if (event.data.action == 'update') {
      var team = event.data.after
      sortAndSplitRoles(team.roles) 
      addToTeamsCache(event.data.url, team)    
    } else if (event.data.action == 'delete')
      deleteFromTeamsCache(event.data.url)
    else if (event.data.action == 'create') {
      var members = event.data.team.members
      if (members !== undefined)
        for (let i=0; i<members.length; i++)
          delete actorsForUserCache[members[i]]
    } else if (event.data.action == 'deleteAll') {
      resetTeamsCache()
    }
  }    
}

function processEventPost(req, res, event) {
  permissionsEventConsumer.processEvent(event)
  rLib.found(res, req.headers.accept, req.url)
}

var IPADDRESS = process.env.PORT !== undefined ? `${process.env.IPADDRESS}:${process.env.PORT}` : process.env.IPADDRESS
var permissionsEventConsumer = new pge.eventConsumer(IPADDRESS, processEvent)

function requestHandler(req, res) {
  if (req.url == '/events')
    if (req.method == 'POST')
      lib.getServerPostObject(req, res, (e) => processEventPost(req, res, e))
    else 
      rLib.methodNotAllowed(res, ['POST'])
  else {
    var req_url = url.parse(req.url)
    if (req_url.pathname == '/allowed-actions' && req_url.search !== null)
      if (req.method == 'GET')
        getAllowedActions(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host))
      else
        rLib.methodNotAllowed(res, ['GET'])
    else if (req_url.pathname == '/is-allowed' && req_url.search !== null)
      if (req.method == 'GET')
        isAllowed(req, res, req_url.search.substring(1))
      else
        rLib.methodNotAllowed(res, ['GET'])
    else if (req_url.pathname == '/is-allowed-to-inherit-from' && req_url.search !== null)
      if (req.method == 'GET')
        isAllowedToInheritFrom(req, res, req_url.search.substring(1))
      else
        rLib.methodNotAllowed(res, ['GET'])
    else
      rLib.notFound(res, `//${req.headers.host}${req.url} not found`)
  }
}

function start() {
  db.init(function () {
    var port = process.env.PORT
    permissionsEventConsumer.init(function() {
      http.createServer(requestHandler).listen(port, function() {
        log('start', `server is listening on ${port}`)
      })
    })
  })
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
