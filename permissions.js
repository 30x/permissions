'use strict'
const http = require('http')
const lib = require('http-helper-functions')
const db = require('./permissions-pg.js')
const querystring = require('querystring')
const url = require('url')
const pge = require('pg-event-consumer')

const ANYONE = 'http://apigee.com/users#anyone'
const INCOGNITO = 'http://apigee.com/users#incognito'

const TEAMS = '/teams/'

function log(method, text) {
  console.log(Date.now(), process.env.COMPONENT, method, text)
}

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
      lib.found(req, res, allowedActions)
    })
  else
    lib.badRequest(res, 'user in query string must match user credentials')
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
  log('isActionAllowed', `_subject: ${permissionsObject._subject} property: ${property} action: ${action} actors: ${actors}`)
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

function cache(resource, permissions, etag) {
  permissions._Etag = etag
  permissions._metadata = null
  permissionsCache[resource] = permissions
}

function withPermissionsDo(req, res, resource, callback, errorCallback) {
  var permissions = permissionsCache[resource]
  if (permissions !== undefined) {
    callback(permissions, permissions._Etag)
  } else {
    function checkResult(err, permissions, etag) {
      if (err)
        if (errorCallback !== undefined)
          errorCallback(err)
        else
          if (err == 404)
            lib.notFound(req, res)
          else
            lib.internalError(res, err)          
      else {
        cache(resource, permissions, etag)
        callback(permissions, etag)
      }      
    }
    db.withPermissionsDo(req, resource, function(err, permissions, etag) {
      if (err == 404)
        lib.sendInternalRequestThen(req, res, '/permissions-migration/migration-request', 'POST', JSON.stringify({resource: resource}), function(clientResponse) {
          if (clientResponse.statusCode = 200)
            db.withPermissionsDo(req, resource, function(err, permissions, etag) {
              checkResult(err, permissions, etag)
            })
          else
            lib.notFound(req, res)
        })
      else 
        checkResult(err, permissions, etag)
    })
  }
}

function withAncestorPermissionsDo(req, res, subject, itemCallback, finalCallback, errorCallback) {
  var recursionSet = {}
  function ancestors(resource, callback, errCallback) {
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
    }, errCallback)
  }
  ancestors(subject, finalCallback, errorCallback)
}

function withTeamsDo(req, res, user, callback) {
  if (user !== null) {
    var actors = teamsCache[user] 
    if (actors !== undefined)
      callback(actors)
    else {  
      user = lib.internalizeURL(user, req.headers.host)
      lib.sendInternalRequestThen(req, res, `/teams?${user.replace('#', '%23')}`, 'GET', undefined, function (clientResponse) {
        lib.getClientResponseBody(clientResponse, function(body) {
          if (err)
            lib.internalError(res, err)
          else if (clientResponse.statusCode == 200) { 
            var actors = JSON.parse(body).contents
            lib.internalizeURLs(actors, req.headers.host)
            actors.unshift(user) // user guaranteed to be first
            teamsCache[user] = actors
            callback(actors)
          } else {
            var err = `unable to retrieve /teams?${user} statusCode ${clientResponse.statusCode}`
            log('withTeamsDo', err)
            lib.internalError(res, err)
          }
        })
      })
    }
  } else
    lib.badRequest(res, 'user must be provided' + req.url)
}

function withRolesDo(req, res, teamURL, callback) {
  var roles = rolesCache[teamURL]
  if (roles !== undefined)
    callback(roles)
  else {
    var req_url = url.parse(teamURL)
    if (req_url.pathname.startsWith(TEAMS)) {
      var id = req_url.pathname.substring(TEAMS.length)  
      db.withTeamDo(req, id, function(err, team) {
        if (err) {
          lib.internalError(res, err)
          log('withRolesDo', `could not find team: ${teamURL}`)
        } else {
          var roles = team.roles
          for (var base in roles) {
            var sortedPaths = Object.keys(roles[base]).sort((a,b) => b.length - a.length)
            roles[base] = sortedPaths.map(x => {return {path: x.split('/'), actions: roles[base][x]}})
          } 
          rolesCache[url] = roles
          callback(roles)
        }        
      })
    } else {
      var err = `unexpected team URL ${teamURL}`
      log('withRolesDo', err)
      lib.internalError(res, err)
    }
  }
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
    var pathPatternsParts = Object.keys(role).map(pattern => pattern.split('/')).sort((a, b) => b.length - a.length)
    for (var i=0; i<role.length; i++)
      if (pathPatternMatch(role[i].path, pathParts))
        return role[i].actions
  }
  return null
}

function withPermissionFlagDo(req, res, subject, property, action, base, path, callback) {
  function withActorsDo (actors) {  
    function checkRoles(answer) {
      if (answer === null && base != null && path != null & actors.length > 1) {
        var count = 1
        var responded = false
        for (let i = 1; i < actors.length; i++)
          withRolesDo(req, res, actors[i], function(roles) {
            var actions = calculateRoleActions(roles, base, path.split('/'))
            if (actions !== null && actions.indexOf(action) > -1) {
              responded = true
              callback(true)
            }
            if (++count == actors.length && !responded) {
              responded = true
              callback(answer)
            }
          })        
      } else
        callback(answer)
    }
    var allowed = null;
    if (subject !== undefined) {
      withAncestorPermissionsDo(req, res, subject, function(permissions) {
        var opinion = isActionAllowed(permissions, property, actors, action)
        if (opinion == true) { // someone says its OK, but there may be  a veto later
          allowed = true
          return false // keep going
        } else if (opinion == false) {
          allowed = false
          return true  // stop looking - operation is forbidden
        } else
          return false // keep going
      }, function() {
        checkRoles(allowed)
      }, function(err) {
        if (err == 404)
          checkRoles(null)
        else
          lib.internalError(res, err)              
      })
    } else
      checkRoles(null)
  }
  var actors
  var user = lib.getUser(req.headers.authorization)
  if (user == null)
    withActorsDo([])
  else {
    withTeamsDo(req, res, user, function(actors) {
      withActorsDo(actors)
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
  withTeamsDo(req, res, user, function(actors) {
    function calculateAllRoleActions(actions) {
      var pathParts = path.split('/')
      var count = 1;
      for (let i=1; i<actors.length; i++) {
        withRolesDo(req, res, actors[i], function(roles) {
          if (roles != null) {
            var roleActions = calculateRoleActions(roles, base, pathParts)
            if (roleActions !== null)
              for (var i = 0; i < roleActions.length; i++)
                actions[roleActions[i]] = true
          }
          if (++count == actors.length)
            callback(Object.keys(actions))
        })
      }
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
          lib.internalError(res, err) 
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
  var resources = Array.isArray(queryParts.resource) ? queryParts.resource : [queryParts.resource]
  if (queryParts.resource !== undefined) 
    resources = resources.map(x => lib.internalizeURL(x, req.headers.host))
  log('isAllowed', `user: ${user} action: ${action} property: ${property} resources: ${resources} base: ${base} path: ${path}`)
  if (user == null || user == lib.getUser(req.headers.authorization))
    if (action !== undefined) {
      var count = 0
      var responded = false
      for (var i = 0; i< resources.length; i++) {
        if (!responded)
          withPermissionFlagDo(req, res, resources[i], property, action, base, path, function(answer) {
            if (!responded) {
              if (++count == resources.length) {
                lib.found(req, res, !!answer)  // answer will be true (allowed), false (forbidden) or null (no informaton, which means no)
                responded = true
                var hrend = process.hrtime(hrstart)
                log('isAllowed', `success, time: ${hrend[0]}s ${hrend[1]/1000000}ms answer: ${answer} resources: ${resources}`)
              } else if (answer == false) {
                lib.found(req, res, false)
                responded = true
                var hrend = process.hrtime(hrstart)
                log('isAllowed', `success, time: ${hrend[0]}s ${hrend[1]/1000000}ms answer: ${answer} resources: ${resources}`)
              }
            }
          })
      }
    } else
      lib.badRequest(res, 'action query parameter must be provided: ' + req.url)
  else  
    lib.forbidden(req, res)
}

function isAllowedToInheritFrom(req, res, queryString) {
  function withExistingAncestorsDo(resource, callback) {
    var ancestors = []
    withAncestorPermissionsDo(req, res, resource, function(permissions) {
      if (permissions._subject != resource)
        ancestors.push(permissions._subject)
    }, function(){
      callback(Array.from(new Set(ancestors)))
    })
  }
  function withPotentialAncestorsDo(ancestors, callback) {
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
  var queryParts = querystring.parse(queryString)
  var subject = queryParts.subject
  if (subject !== undefined) {
    subject = lib.internalizeURL(subject, req.headers.host)
    withPermissionFlagDo(req, res, subject, '_permissions', 'read', null, null, function(answer) {
      if (answer) {
        var sharingSet = queryParts.sharingSet
        var existingAncestors = null
        var potentialAncestors = sharingSet !== undefined ? null : []
        withExistingAncestorsDo(subject, function(existing) {
          existingAncestors = existing
          if (potentialAncestors !== null) {
            processAncestors()
          }
        })
        if (sharingSet !== undefined) {
          var sharingSets = Array.isArray(sharingSet) ? sharingSet : [sharingSet]
          sharingSets = sharingSets.map(anURL => lib.internalizeURL(anURL, req.headers.host))
          withPotentialAncestorsDo(sharingSets, function (potential) {
            potentialAncestors = potential
            if (existingAncestors !== null) {
              processAncestors()
            }
          })
        }
        function processAncestors() {
          // The algorithm here is a bit different from the usual permissions inheritance lookup. In the usual case
          // we are considering a single action, and going up the hierarchy to find a permission that allows it. In this case
          // we consider that we are doing an add or remove at every level, so we are going up the hierarchy multiple times,
          // once for each add or remove at each level of the hierarchy.
          if (potentialAncestors.indexOf(subject) == -1) {
            var addedAncestors = potentialAncestors.filter(x=>existingAncestors.indexOf(x) == -1)
            var removedAncestors = existingAncestors.filter(x=>potentialAncestors.indexOf(x) == -1)
            var responded = false
            var addOK = addedAncestors.length == 0
            var removeOK = removedAncestors.length == 0
            var allPotentialAncestorsVoted = potentialAncestors.length == 0
            if (removedAncestors.length > 0) {
              let count = 0
              for (let i=0; i < removedAncestors.length; i++)
                withPermissionFlagDo(req, res, removedAncestors[i], '_permissionsHeirs', 'remove', null, null, function(answer) {
                  if (!responded) 
                    if (!answer) {
                      responded = true
                      lib.found(req, res, {result: false, reason: `may not remove permissions inheritance from ${removedAncestors[i]}`}) 
                    } else
                      if (++count == removedAncestors.length) {
                        removeOK = true
                        if (addOK && allPotentialAncestorsVoted) {
                          responded = true
                          lib.found(req, res, true)
                        }
                      }
                })
            }
            if (addedAncestors.length > 0) {
              let count = 0
              for (let i=0; i < addedAncestors.length; i++) 
                withPermissionFlagDo(req, res, addedAncestors[i], '_permissionsHeirs', 'add', null, null, function(answer) {
                  if (!responded)
                    if (!answer) {
                      responded = true
                      lib.found(req, res, {result: false, reason: `may not add permissions inheritance to ${addedAncestors[i]}`}) 
                    } else
                      if (++count == addedAncestors.length) {
                        addOK = true
                        if (removeOK && allPotentialAncestorsVoted) {
                          responded = true
                          lib.found(req, res, true)
                        }
                      }
                })
            }
            if (potentialAncestors.length > 0) {
              let count = 0
              for (let i=0; i < potentialAncestors.length; i++) 
                withAncestorPermissionsDo(req, res, potentialAncestors[i], 
                  function (permissions) {
                    return false
                  },
                  function(stopped) {
                    if (!allPotentialAncestorsVoted)
                      if (stopped || ++count == potentialAncestors.length) {
                        allPotentialAncestorsVoted = true
                        if (removeOK && addOK) {
                          responded = true
                          lib.found(req, res, true)
                        }
                      }
                  }
                )
            }
          } else
            lib.found(req, res, {result: false, reason: `may not add cycle to permisions inheritance`}) // cycles not allowed
        }        
      } else
        lib.forbidden(req, res)
    })
  } else {
    lib.badRequest(res, `must provide subject in querystring: ${queryString} ${JSON.stringify(queryParts)}`)
  }
}

function processEvent(event) {
  if (event.topic == 'eventGapDetected') {
    log('processEvent', 'event.topic: eventGapDetected')
    permissionsCache = {}
    teamsCache = {}
  } else if (event.topic == 'permissions')
    if (event.data.action == 'deleteAll') {
      log('processEvent', `event.index: ${event.index} event.topic: ${event.topic} event.data.action: deleteAll`)
      permissionsCache = {}
    } else {
      log('processEvent', `event.index: ${event.index} event.topic: ${event.topic} event.data.action: ${event.data.action} subject: ${event.data.subject}`)
      delete permissionsCache[event.data.subject]
    }
  else if (event.topic == 'teams')
    if (event.data.action == 'update') {
      log('processEvent', `event.index: ${event.index} event.topic: ${event.topic} event.data.action: ${event.data.action} event.data.url: ${event.data.url} before: ${event.data.before} after ${event.data.after}`)
      delete rolesCache[event.data.url]
      var beforeMembers = event.data.before.members || []
      var afterMembers = event.data.after.members || []
      for (let i = 0; i < beforeMembers.length; i++)
        if (afterMembers.indexOf(beforeMembers[i]) == -1)
          delete teamsCache[beforeMembers[i]]
      for (let i = 0; i < afterMembers.length; i++)
        if (beforeMembers.indexOf(afterMembers[i]) == -1)
          delete teamsCache[afterMembers[i]]
    } else if (event.data.action == 'delete' || event.data.action == 'create') {
      delete rolesCache[event.data.url]
      var members = event.data.team.members
      log('processEvent', `event.index: ${event.index} event.topic: ${event.topic} event.data.action: ${event.data.action} event.data.url: ${event.data.url} members: ${members}`)
      if (members !== undefined) {
        for (let i = 0; i < members.length; i++) {
          delete teamsCache[members[i]]
        }
      }
    } else
      log('processEvent', `event.index: ${event.index} event.topic: ${event.topic} event.data.action: ${event.data.action}`)
  else
    log('processEvent', `event.index: ${event.index} event.topic: ${event.topic} event.data.action: ${event.data.action}`)    
}

function processEventPost(req, res, event) {
  permissionsEventConsumer.processEvent(event)
  lib.found(req, res)
}

var IPADDRESS = process.env.PORT !== undefined ? `${process.env.IPADDRESS}:${process.env.PORT}` : process.env.IPADDRESS
var permissionsEventConsumer = new pge.eventConsumer(IPADDRESS, processEvent)

var permissionsCache = {} // key is permissions subject URL, value is permissions object
var teamsCache = {} // key is User's URL, value is array of URLS
var rolesCache = {} // key is team URL, value is roles object whose keys are 'base URLs'

function requestHandler(req, res) {
  if (req.url == '/events')
    if (req.method == 'POST')
      lib.getServerPostObject(req, res, (e) => processEventPost(req, res, e))
    else 
      lib.methodNotAllowed(req, res, ['POST'])
  else {
    var req_url = url.parse(req.url)
    if (req_url.pathname == '/allowed-actions' && req_url.search !== null)
      if (req.method == 'GET')
        getAllowedActions(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host))
      else
        lib.methodNotAllowed(req, res, ['GET'])
    else if (req_url.pathname == '/is-allowed' && req_url.search !== null)
      if (req.method == 'GET')
        isAllowed(req, res, req_url.search.substring(1))
      else
        lib.methodNotAllowed(req, res, ['GET'])
    else if (req_url.pathname == '/is-allowed-to-inherit-from' && req_url.search !== null)
      if (req.method == 'GET')
        isAllowedToInheritFrom(req, res, req_url.search.substring(1))
      else
        lib.methodNotAllowed(req, res, ['GET'])
    else
      lib.notFound(req, res)
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
