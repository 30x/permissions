'use strict'
const http = require('http')
const lib = require('http-helper-functions')
const db = require('./permissions-pg.js')
const querystring = require('querystring')
const url = require('url')
const pge = require('pg-event-consumer')

const ANYONE = 'http://apigee.com/users#anyone'
const INCOGNITO = 'http://apigee.com/users#incognito'

function getAllowedActions(req, res, queryString) {
  var queryParts = querystring.parse(queryString)
  var resource = lib.internalizeURL(queryParts.resource, req.headers.host)
  var user = queryParts.user
  var property = queryParts.property || '_self'
  console.log(`permissions:getAllowedActions: resource: ${resource} user: ${user} property: ${property}`)
  if (user == lib.getUser(req.headers.authorization)) 
    withAllowedActionsDo(req, res, resource, property, user, function(allowedActions) {
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
  console.log(`permissions:isActionAllowed: _subject: ${permissionsObject._subject} property: ${property} action: ${action} actors: ${actors}`)
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
  permissionsCache[resource] = permissions
}

function withPermissionsDo(req, res, resource, callback) {
  var permissions = permissionsCache[resource]
  if (permissions !== undefined) {
    callback(permissions, permissions._Etag)
  } else {
    function checkResult(err, permissions, etag) {
      if (err == 404)
        lib.notFound(req, res)
      else if (err)
        lib.internalError(err)
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

function withAncestorPermissionsDo(req, res, subject, itemCallback, finalCallback) {
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
    })
  }
  ancestors(subject, finalCallback)
}

function withTeamsDo(req, res, user, callback) {
  if (user !== null) {
    user = lib.internalizeURL(user, req.headers.host)
    lib.sendInternalRequestThen(req, res, `/teams?${user.replace('#', '%23')}`, 'GET', undefined, function (clientResponse) {
      lib.getClientResponseBody(clientResponse, function(body) {
        if (err)
          lib.internalError(res, err)
        else if (clientResponse.statusCode == 200) { 
          var actors = JSON.parse(body).contents
          lib.internalizeURLs(actors, req.headers.host)
          actors.unshift(user) // user guaranteed to be first
          actors.push([user.split('#')[0], 'anyone'].join('#')) // anyone from the user's issuer
          callback(actors)
        } else {
          var err = `withTeamsDo: unable to retrieve /teams?${user} statusCode ${clientResponse.statusCode}`
          console.log(err)
          lib.internalError(res, err)
        }
      })
    })
  } else
    lib.badRequest(res, 'user must be provided' + req.url)
}

function withPermissionFlagDo(req, res, subject, property, action, callback) {
  function withActorsDo (actors) {  
    var allowed = null;
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
      callback(allowed)
    }) 
  }
  var actors
  var user = lib.getUser(req.headers.authorization)
  if (user == null)
    withActorsDo([])
  else {
    var actors = teamsCache[user] 
    if (actors !== undefined)
      withActorsDo(actors)
    else
      withTeamsDo(req, res, user, function(actors) {
        teamsCache[user] = actors
        withActorsDo(actors)
      })
  }
}

function withAncestorPermissionsTreeDo(req, res, subject, callback) {
  var recursionSet = {}
  var tree = []
  function withAncestorPermissionsDo(resource, tree, callback) {
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
            withAncestorPermissionsDo(inheritsPermissionsOf[j], tree[j+1], function(subtree) {
              if (++count == inheritsPermissionsOf.length) 
                callback(tree)
            })
          }
        } else
          callback(tree)
      } else
        callback(tree)
    })
  }
  withAncestorPermissionsDo(subject, tree, callback)
}

function withAllowedActionsDo(req, res, resource, property, user, callback) {
  var actors = teamsCache[user]
  if (actors !== undefined)
    withActorsDo(actors)
  else
    withTeamsDo(req, res, user, function(actors) {
      teamsCache[user] = actors
      withActorsDo(actors)
    })
  function calculateActions(node, actors) {
    var permissions = node[0]
    if (permissions._constraints && permissions._constraints.validIssuers) // only users validated with these issuers allowed
      if (actors.length == 0 || permissions._constraints.validIssuers.indexOf(actors[0].split('#')[0]) < 0) { // user's issuer not in the list
        return [[], true]
      }
    var actions = {}
    var wideningForbidden = false
    for (var i = 1; i < node.length; i++) {
      var [ancestorActions, ancestorWideningForbidden] = calculateActions(node[i], actors)
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
  function withActorsDo (actors) {  
    var actions = {}
    withAncestorPermissionsTreeDo(req, res, resource, function(tree) {
      callback(Object.keys(calculateActions(tree, actors)[0]))
    }) 
  }
}

function isAllowed(req, res, queryString) {
  var hrstart = process.hrtime()
  var queryParts = querystring.parse(queryString)
  var user = queryParts.user
  var action = queryParts.action
  var property = queryParts.property || '_self'
  var resources = Array.isArray(queryParts.resource) ? queryParts.resource : [queryParts.resource]
  resources = resources.map(x => lib.internalizeURL(x, req.headers.host))
  console.log(`permissions:isAllowed: user: ${user} action: ${action} property: ${property} resources: ${resources}`)
  if (user == null || user == lib.getUser(req.headers.authorization))
    if (action !== undefined)
      if (queryParts.resource !== undefined) {
        var count = 0
        var responded = false
        for (var i = 0; i< resources.length; i++) {
          if (!responded) {
            var resource = resources[i]
            var resourceParts = url.parse(resource)
            withPermissionFlagDo(req, res, resource, property, action, function(answer) {
              if (!responded) {
                if (++count == resources.length) {
                  lib.found(req, res, !!answer)  // answer will be true (allowed), false (forbidden) or null (no informaton, which means no)
                  responded = true
                  var hrend = process.hrtime(hrstart)
                  console.log(`permissions:isAllowed:success, time: ${hrend[0]}s ${hrend[1]/1000000}ms`)
                } else if (answer == false) {
                  lib.found(req, res, false)
                  responded = true
                  var hrend = process.hrtime(hrstart)
                  console.log(`permissions:isAllowed:success, time: ${hrend[0]}s ${hrend[1]/1000000}ms`)
                }
              }
            })
          }
        }
      } else
        lib.badRequest(res, 'resource  query parameter must be provided: ' + req.url)
    else
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
    withPermissionFlagDo(req, res, subject, '_permissions', 'read', function(answer) {
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
                withPermissionFlagDo(req, res, removedAncestors[i], '_permissionsHeirs', 'remove', function(answer) {
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
                withPermissionFlagDo(req, res, addedAncestors[i], '_permissionsHeirs', 'add', function(answer) {
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
    console.log('permissions: processEvent: event.topic: eventGapDetected')
    permissionsCache = {}
    teamsCache = {}
  } else if (event.topic == 'permissions')
    if (event.data.action == 'deleteAll') {
      console.log(`permissions: processEvent: event.index: ${event.index} event.topic: ${event.topic} event.data.action: deleteAll`)
      permissionsCache = {}
    } else {
      console.log(`permissions: processEvent: event.index: ${event.index} event.topic: ${event.topic} event.data.action: ${event.data.action} subject: ${event.data.subject}`)
      delete permissionsCache[event.data.subject]
    }
  else if (event.topic == 'teams')
    if (event.data.action == 'update') {
      console.log(`permissions: processEvent: event.index: ${event.index} event.topic: ${event.topic} event.data.action: ${event.data.action} before: ${event.data.before} after ${event.data.after}`)
      var beforeMembers = event.data.before.members || []
      var afterMembers = event.data.after.members || []
      for (let i = 0; i < beforeMembers.length; i++)
        if (afterMembers.indexOf(beforeMembers[i]) == -1)
          delete teamsCache[beforeMembers[i]]
      for (let i = 0; i < afterMembers.length; i++)
        if (beforeMembers.indexOf(afterMembers[i]) == -1)
          delete teamsCache[afterMembers[i]]
    } else if (event.data.action == 'delete' || event.data.action == 'create') {
      var members = event.data.team.members
      console.log(`permissions: processEvent: event.index: ${event.index} event.topic: ${event.topic} event.data.action: ${event.data.action} members: `, members)
      if (members !== undefined) {
        for (let i = 0; i < members.length; i++) {
          delete teamsCache[members[i]]
        }
      }
    } else
      console.log(`permissions: processEvent: event.index: ${event.index} event.topic: ${event.topic} event.data.action: ${event.data.action}`)
  else
    console.log(`permissions: processEvent: event.index: ${event.index} event.topic: ${event.topic} event.data.action: ${event.data.action}`)    
}

function processEventPost(req, res, event) {
  permissionsEventConsumer.processEvent(event)
  lib.found(req, res)
}

var IPADDRESS = process.env.PORT !== undefined ? `${process.env.IPADDRESS}:${process.env.PORT}` : process.env.IPADDRESS
var permissionsEventConsumer = new pge.eventConsumer(IPADDRESS, processEvent)

var permissionsCache = {}
var teamsCache = {}

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
        console.log(`server is listening on ${port}`)
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
