'use strict'
const http = require('http')
const lib = require('@apigee/http-helper-functions')
const rLib = require('@apigee/response-helper-functions')
const db = require('./permissions-pg.js')
const querystring = require('querystring')
const url = require('url')
const pge = require('@apigee/pg-event-consumer')
const util = require('util')

const ANYONE = 'http://apigee.com/users#anyone'
const INCOGNITO = 'http://apigee.com/users#incognito'

const TEAMS = '/az-tm-'

const PERMISSIONS_CACHE_NUMBER_OF_SHARDS = process.env.PERMISSIONS_CACHE_NUMBER_OF_SHARDS || 10
const CACHE_ENTRY_TTL = process.env.CACHE_ENTRY_TTL || 60*60*1000
const CACHE_SWEEP_INTERVAL = process.env.CACHE_SWEEP_INTERVAL || 10*60*1000
const SPEEDUP = process.env.SPEEDUP || 1

const SCOPE_READ = 'az.read'
const SCOPE_WRITE = 'az.write'

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
  for (let beforeMember of beforeMembers)
    if (afterMembers.indexOf(beforeMember) == -1)
      delete actorsForUserCache[beforeMember]
  for (let afterMember of afterMembers)
    if (beforeMembers.indexOf(afterMember) == -1)
      delete actorsForUserCache[afterMembers]    
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
  log('scanTeamsCache', 'scanning teams cache')
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
  var property = queryParts.property || '_self'
  log('getAllowedActions', `resource: ${resource} user: ${user} property: ${property}`)
  let userFromToken = lib.getUser(req.headers.authorization)
  if (user == userFromToken) 
    // In the API getAllowedActions, we assume that the resource value could be either a resourceID
    // or a concatenation of a base resource and a path. We pass the resource to withAllowedActionsDo
    // as both, so that it will be checked both ways
    withAllowedActionsDo(req, res, resource, resource, property, user, function(allowedActions) {
      rLib.found(res, allowedActions, req.headers.accept, req.url)
    })
  else
    rLib.forbidden(res, {msg: 'user in query string must match user credentials', queryStringUser: user, credentialsUser: userFromToken}, req.headers.accept, req.url)
}

function collateAllowedActions(permissionsObject, property, actors) {
  permissionsObject = permissionsObject[property]
  if (permissionsObject !== undefined) {
    var allowedActions = {}
    for (var action in permissionsObject) {
      var allowedActors = permissionsObject[action]
      if (allowedActors !== undefined)
        if (allowedActors.includes(INCOGNITO))  
          allowedActions[action] = true
        else if (actors !== null) 
          if (allowedActors.includes(ANYONE)) 
            allowedActions[action] = true       
          else if (allowedActors.includes(allowedActors[0].split('#')[0] + '#anyone'))
            allowedActions[action] = true
          else
            for (let actor of actors) {
              if (allowedActors.includes(actor))
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
      if (allowedActors.includes(INCOGNITO))
        return true
      else if (allowedActors.includes(ANYONE))
        return true
      else if (actors != null && actors.length > 0) {
        let user = actors[0]  // first entry in actors is the user
        let issuer = user.split('#')[0]
        if (allowedActors.includes(issuer + '#anyone'))
          return true
        else 
          for (let actor of actors) {
            if (allowedActors.includes(actor))
              return true
          }
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
  function checkResult(err, permissions, etag) {
    if (err == 404)
      addToPermissionsCache(resource, null)
    if (err)
      if (errorCallback !== undefined)
        errorCallback(err)
      else
        if (err == 404)
          rLib.notFound(res, {msg: 'permissions document not found', subject: resource})
        else
          rLib.internalError(res, err)          
    else {
      addToPermissionsCache(resource, permissions, etag)
      callback(permissions, etag)
    }      
  }
  if (permissions !== undefined && permissions !== null) {
    callback(permissions)
  } else {
    if (permissions === null) // we checked before — it's not there
      checkResult(404)
    else
      db.withPermissionsDo(req, resource, function(err, permissions, etag) {
        if (!req.headers['x-from-migration'] && err === 404)
          lib.sendInternalRequestThen(res, 'POST', '/az-permissions-migration/migration-request', lib.flowThroughHeaders(req), JSON.stringify({resource: resource}), function(clientResponse) {
            if (clientResponse.statusCode === 200 || clientResponse.statusCode === 409){
              log('withPermissionsDo', 'Finished migration check, resending original request')
              req.headers['x-from-migration'] = 'yes'
              requestHandler(req,res)
            } else
              if (clientResponse.statusCode === 404)
                if (errorCallback !== undefined)
                  errorCallback(404)
                else
                  rLib.notFound(res, `//${req.headers.host}${req.url} not found`)
              else
                rLib.internalError(res, {msg: 'unexpected migration status code', status_code: clientResponse.statusCode})
          })
        else 
          checkResult(err, permissions, etag)
      })
  }
}

function withAncestorPermissionsDo(req, res, subject, itemCallback, finalCallback, errorCallback) {
  var recursionSet = {}
  function ancestors(resource, callback) {
    withPermissionsDo(req, res, resource, (permissions) => {
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
            for (let resource of inheritsPermissionsOf) {
              recursionSet[resource] = true 
              ancestors(resource, (stopped) => {
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
      roles[base] = sortedSplitPaths.map(splitPath => ({path: splitPath, actions: roles[base][splitPath.join('/')]}))
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
          for (let row of rows) {
            var teamURL = `${TEAMS}${row.id}`
            var team = row.data
            team.self = teamURL
            team.etag = row.etag 
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
    callback([])
}

function pathPatternMatch(pathPatternParts, pathParts) {
  // the "/" permission path is a wildcard for all resources, and results in patternParts as ['','']
  if(pathPatternParts.length === 2 && pathPatternParts[0] === '' && pathPatternParts[1] ===  '')
    return true
  for (let j=0; j < pathParts.length; j++) {
    let patternSegement = pathPatternParts[j]
    if (patternSegement != '*' && patternSegement != pathParts[j])
      return false
  }
  // return false if the permission's path is more granular than resource path provided
  return pathPatternParts.length <= pathParts.length;
}

function calculateRoleActions(bases, baseAndPath) {
  if (bases != null){
    for (let base in bases) {
      if (baseAndPath.startsWith(base)) {
        let pathParts = baseAndPath.substring(base.length, baseAndPath.length).split('/')
        let permissions = bases[base]
        for (let permission of permissions){
          if (pathPatternMatch(permission.path, pathParts)){
            return [permission.actions, base]
          }
        }
      }
    }
  }
  return [null, null]
}

/**
 * This jsdoc defines the callback parameter to buildQueryResult
 * @callback checkRolesCallback
 * @param {boolean or null} answer
 * @param {Array} scopes
 */
/**
 * checkRoles looks to see if the roles stored with the team of which the
 * user is a member grant permission for the action and path. 
 * 
 * @param {Array} actors
 * @param {string} baseAndPath
 * @param {string} action
 * @param {boolean or null} answer
 * @param {Array} scopes
 * @param {checkRolesCallback} callback
 */
function checkRoles(actors, baseAndPath, action, answer, scopes, callback) {
  if (answer == null && baseAndPath)
    for (let i = 1; i < actors.length && answer === null ; i++) {
      let roles = retrieveFromTeamsCache(actors[i]).roles // touching the teamsCache will keep entry alive
      let [actions, base] = calculateRoleActions(roles, baseAndPath)
      if (actions !== null && actions.includes(action)) {
        if (scopes)
          scopes.push(base)
        answer = true
      }
    }  
  callback(answer, scopes)
}

function withPermissionFlagDo(req, res, user, actors, subject, property, action, withScopes, callback) {
  var allowed = null
  var scopes = withScopes ? [] : undefined
  if (subject === undefined)
    callback(allowed)
  else
    withAncestorPermissionsDo(req, res, subject, (permissions) => {
      // This function parameter is called for each ancestor permissions document.
      // If it returns true, the ancestor tree traversal will stop, otherwise it will continue
      if (withScopes)
        scopes.push(permissions._subject)
      var opinion = isActionAllowed(permissions, property, actors, action)
      if (opinion == true) { // someone says its OK, but there may be  a veto later
        // Be careful not to set allowed to true if it is currently set to false
        allowed = allowed == null || allowed == true
        return false // keep going
      } else if (opinion == false) {
        allowed = false
        return !withScopes  // operation is forbidden. Stop looking unless we need to return the hierarchy
      } else
        return false // keep going
    }, () => {
      // This function parameter is called when all the acestors have been traversed
      // Or when the item function aboce returns true. 
      callback(allowed)
    }, function(err) {
      // This function parameter is called when on error.
      // tyical error is a missing permissions document 
      if (err == 404)
        callback(allowed)
      else
        lib.internalError(res, err)              
    })
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

function withAllowedActionsDo(req, res, resource, baseAndPath, property, user, callback) {
  withActorsForUserDo(req, res, user, function(actors) {
    function calculateAllRoleActions(actions) {
      if (baseAndPath) {
        for (let i=1; i<actors.length; i++) {
          let roles = retrieveFromTeamsCache(actors[i]).roles
          if (roles != null) {
            let [roleActions, base] = calculateRoleActions(roles, baseAndPath)
            if (roleActions !== null)
              for (let roleAction of roleActions)
                actions[roleAction] = true
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
        var entityActions = entityCalculations[0]
        var wideningForbidden = entityCalculations[1]
        if (wideningForbidden || actors.length <=1)
          callback(Object.keys(entityActions))
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

/**
 * This jsdoc defines the callback parameter to buildQueryResult
 * @callback isAllowedCallback
 * @param {boolean or object} - see 'isAllowed' for explanation
 */
/**
 * See 'isAllowed for explanations
 * 
 * @param {object} req 
 * @param {object} res 
 * @param {url-string} user 
 * @param {[url-string]} resources 
 * @param {boolean} withScopes 
 * @param {boolean} withIndividualAnswers 
 * @param {isAllowedCallback} callback 
 */
function _isAllowed(req, res, user, resources, withScopes, withIndividualAnswers, permissionsFunction, callback) {
  let result = {
    scopes: withScopes ? {} : null,
    answers: withIndividualAnswers ? {} : null
  }
  var count = 0
  var responded = false
  // Multiple resources is interpreted to mean that the user must have access to all of them. 
  // For an API that returns true if the user has access to any one of the resources, see areAnyAllowed.  
  withActorsForUserDo(req, res, user, function(actors) {    
    for (let resource of resources) {
      permissionsFunction(actors, resource, processResult)
      function processResult(answer, scopes) {
        if (!responded) {
          // If result.allowed is already false, then it must remain false, regardless of the value of answer
          result.allowed = result.allowed === undefined ? answer : result.allowed && answer
          if (withScopes)
            result.scopes[resource] = Array.from(new Set(scopes))
          if (withIndividualAnswers)
            result.answers[resources[i]] = answer
            // in the simples case, we stop looking if result.allowed is false. However, if the user asked for
          // the scopes, or asked for an individual answer for each resource, then we need to continue
          if (!result.allowed && !withScopes && !withIndividualAnswers) {
            callback(result.allowed)
            responded = true
          } else if (++count == resources.length) {
            if (withScopes || withIndividualAnswers) 
              callback(result)
            else
              callback(result.allowed)
          }
        }
      }
    }
  })
}

/**
 * Check to see if the user provided matches the token. A match occurs if the
 * user in the token is the same, or if the user has appropriate read scope.
 * A 'user' can be a user or clientID. If the user is OK, call the callback
 * function, otherwise send an appropriate error message
 * 
 * @param {object} req. An HTTP request object 
 * @param {object} res. An HTTP serverResponse Object
 * @param {string} user. A URL
 * @param {function} callback - No parameters
 */
function ifUserMatchesRequestTokenThen(req, res, user, callback) {
  let withScopes, withIndividualAnswers
  if (user === null || user === lib.getUser(req.headers.authorization))
    callback()
  else if (user && req.headers['x-client-authorization']) {
    let client = lib.getUser(req.headers['x-client-authorization'])
    _isAllowed(req, res, client, ['/'], withScopes, withIndividualAnswers, permissionsFunction, (answer) => {
      if (answer)
        callback()
      else
        rLib.unauthorized(res, {msg: 'client in x-client-authorization token does not have permission to read permissions', client: client})
    }) 
  } else
    if (req.headers.authorization)
      rLib.forbidden(res, {msg: 'user must be provided in querystring and must match user in token', querystringUser: user, tokenUser: lib.getUser(req.headers.authorization)})
    else
      rLib.unauthorized(res, {msg: 'bearer token missing or expired'})
  function permissionsFunction (actors, resource, processResult) {
    withPermissionFlagDo(req, res, user, actors, resource, 'az-permissions', 'read', withScopes, processResult)
  }
}

/**
 * 'isAllowed' implements one of the primary APIs of the permissions runt-time. It is used to check
 * whether a particular user has permission to perform a particular action on a partocular set of resources
 * 
 * @param {object} req. An HTTP request object 
 * @param {object} res. An HTTP response object
 * @param {string} query. A querystring from the URL of the incoming request. The querystring may include the following parameters
 *     user - the user whose permissions are being checked. Must match the user in the authorization bearer token
 *     action                - the action the user wishes to perform. 
 *                             Can be any string, but create, read, update, delete, add, and remove are the recommended ones
 *     property              - the name of the relationship or property the user wants to access or change. '_self' means the whole object
 *     resource              - the resource the user wishes to access. May appear multiple times to mean multiple resources.
 *                             If multiple resources are provided, each one is checked, and the answer is an AND of them all
 *     withScopes            - the client wants to get back the list of all ancestors in the inheritance hierarchy at the time
 *                             of the call. This is important for audit logging as it will control who can see those particular
 *                             audit records. The audit log contains the logs for multiple tenants, and we don't want Coke
 *                             to see Pepsi's audit log records unless they pertain to resoures they have agreed to share.
 *                             (ToDo: consider renaming this parameter to 'withAncestors')
 *     withIndividualAnswers - the client wants to know the permissions result for each individual resource, in addition to the aggregate
 * @returns the body of the request response depends on the query parameters.
 *     {boolean} - if neither withScopes nor withIndividualAnswers was specified in the querystring, 
 *                 the response will be either the string true, or the string false
 *     {object}  - if either withScopes or withIndividualAnswers was specified in the querystring, the result will be an object of the form
 *                 {"allowed": true/false
 *                  "scopes": [<url1>, ..., <urlN>],
 *                  "result.answers": {
 *                     "resourceUrl1": true/false,
 *                     ...
 *                     "resourceUrlM": true/false,
 *                  }
 *                 }
 */
function isAllowed(req, res, query) {
  // In the API isAllowe, we assume that each resource value could be either a resourceID
  // or a concatenation of a base resource and a path.
  let queryParts =  querystring.parse(query)
  var hrstart = process.hrtime()
  var user = queryParts.user
  var action = queryParts.action
  var property = queryParts.property || '_self'
  var withScopes = queryParts.withScopes == '' || queryParts.withScopes
  var withIndividualAnswers = queryParts.withIndividualAnswers == '' || queryParts.withIndividualAnswers
  var resources = Array.isArray(queryParts.resource) ? queryParts.resource : [queryParts.resource]
  if (queryParts.resource !== undefined) 
    resources = resources.map(x => lib.internalizeURL(x, req.headers.host))
  log('isAllowed', `user: ${user} action: ${action} property: ${property} resources: ${resources} withScopes: ${withScopes} withIndividualAnswers: ${withIndividualAnswers}`)
  ifUserMatchesRequestTokenThen(req, res, user, () => {
    if (action === undefined)
      rLib.badRequest(res, 'action query parameter must be provided: ' + req.url)
    else {
      _isAllowed(req, res, user, resources, withScopes, withIndividualAnswers, permissionsFunction, (result) => {
        // result will be true (allowed), false (forbidden) or null (no informaton, which callers normally interpret to mean no)
        // if withScopes or withIndividualAnswers is set, the result will be wrapped in an object    
        rLib.found(res, result, req.headers.accept, req.url)  
        var hrend = process.hrtime(hrstart)
        log('isAllowed', `success, time: ${hrend[0]}s ${hrend[1]/1000000}ms answer: ${typeof result == 'string' ? result : JSON.stringify(result)} resources: ${resources}`)    
      })
    }
  })
  function permissionsFunction (actors, resource, processResult) {
    withPermissionFlagDo(req, res, user, actors, resource, property, action, withScopes, (answer, scopes) => {
      if (answer == null && (!property || property == '_self'))
        checkRoles(actors, resource, action, answer, scopes, (answer, scopes) => {
          processResult(answer, scopes)
        })
      else
        processResult(answer, scopes)
    })
  }
}

/**
 * Answers true if the user has access to any one of the specified resources
 *  
 * @param {object} req. An HTTP request object 
 * @param {object} res. An HTTP response object
 * @param {string} query. A querystring from the URL of the incoming request. The querystring may include the following parameters
 *     user                  - the user whose permissions are being checked. Must match the user in the authorization bearer token
 *     action                - the action the user wishes to perform. 
 *                             Can be any string, but create, read, update, delete, add, and remove are the recommended ones
 *     property              - the name of the relationship or property the user wants to access or change. '_self' means the whole object
 *     resource              - the resource(s) the user wishes to access. May appear multiple times to mean multiple resources 
 *                             If multiple resources are provided, each one is checked, and the answer is an AND of them all
 * @returns {boolean} - 'return' is in the form of an HTTP response, not a function return
 */
function areAnyAllowed(req, res, queryParts) {
  var hrstart = process.hrtime()
  var user = queryParts.user
  var action = queryParts.action
  var property = queryParts.property || '_self'
  var resources = Array.isArray(queryParts.resource) ? queryParts.resource : [queryParts.resource]
  log('areAnyAllowed', `user: ${user} action: ${action} property: ${property} resources: ${resources}`)
  if (user == null || user == lib.getUser(req.headers.authorization))
    if (action === undefined)
      rLib.badRequest(res, 'action query parameter must be provided: ' + req.url)
    else
      if (queryParts.resource === undefined)
        rLib.badRequest(res, 'must provide at least one resource')
      else {
        resources = resources.map(x => lib.internalizeURL(x, req.headers.host))
        var count = 0
        var responded = false
        withActorsForUserDo(req, res, user, function(actors) {
          for (let resource of resources)
            if (!responded)
              // In the API areAnyAllowed, we assume that each resource value could be either a resourceID
              // or a concatenation of a base resource and a path. We pass the resource to withPermissionFlagDo
              // as both, so that it will be checked both ways
              withPermissionFlagDo(req, res, user, actors, resource, property, action, null, (answer) => {
                if (answer == null && (!property || property == '_self'))
                  checkRoles(actors, resource, action, answer, null, processResult)
                else
                  processResult(answer)                      
              })
        })
      }
    else  
      rLib.forbidden(res, {msg: `user must be provided in querystring and must match user in token. querystring user ${user} token user: ${lib.getUser(req.headers.authorization)}`})
  function processResult(answer) {
    if (!responded) {
      if (answer || ++count == resources.length) {
        rLib.found(res, answer, req.headers.accept, req.url)  // answer will be true (allowed), false (forbidden) or null (no informaton, which means no)  
        responded = true
        var hrend = process.hrtime(hrstart)
        log('areAnyAllowed', `success, time: ${hrend[0]}s ${hrend[1]/1000000}ms answer: ${answer} resources: ${resources}`)            
      }
    }
  }
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
      for (let ancestor of ancestors)
        withAncestorPermissionsDo(req, res, ancestor, function(permissions) {
          allAncestors.push(permissions._subject)
        }, function(){
          if (++count == ancestors.length)
            callback(Array.from(new Set(allAncestors)))
        })
    }      
  }
  function withExistingParentsDo(resource, callback) {
    if (resource)
      withPermissionsDo(req, res, resource, permissions => {
        if (permissions._inheritsPermissionsOf)
          callback(permissions._inheritsPermissionsOf)
        else
          callback([])
      })
    else
      callback([])
  }
  function checkPotentialAncestors(user, actors, existingParents, existingAncestors, sharingSets) {
    withPotentialAncestorsDo(sharingSets, function (potentialAncestors) {
      // The algorithm here is a bit different from the usual permissions inheritance lookup. In the usual case
      // we are considering a single action, and going up the hierarchy to find a permission that allows it. In this case
      // we consider that we are doing an add or remove at every level, so we are going up the hierarchy multiple times,
      // once for each add or remove at each level of the hierarchy.
      function positiveResult() {
        return {allowed: true, scopes: Array.from(new Set(existingAncestors.concat(potentialAncestors)))}
      }
      if (potentialAncestors.indexOf(subject) == -1) {
        var addedParents = sharingSets.filter(x=>existingParents.indexOf(x) == -1)
        var removedParents = existingParents.filter(x=>sharingSets.indexOf(x) == -1)
        var responded = false
        var addOK = addedParents.length == 0
        var removeOK = removedParents.length == 0
        if (removedParents.length > 0) {
          let count = 0
          for (let removedParent of removedParents)
            withPermissionFlagDo(req, res, user, actors, removedParent, '_permissionsHeirs', 'remove', false, function(answer) {
              if (!responded) 
                if (!answer) {
                  responded = true
                  rLib.found(res, {allowed: false, reason: `may not remove permissions inheritance from ${removedParents[i]}`}, req.headers.accept, req.url) 
                } else
                  if (++count == removedParents.length) {
                    removeOK = true
                    if (addOK) {
                      responded = true
                      rLib.found(res, positiveResult(), req.headers.accept, req.url)
                    }
                  }
            })
        }
        if (addedParents.length > 0) {
          let count = 0
          for (let addedParent of addedParents) 
            withPermissionFlagDo(req, res, user, actors, addedParent, '_permissionsHeirs', 'add', false, function(answer) {
              if (!responded)
                if (!answer) {
                  responded = true
                  rLib.found(res, {result: false, reason: `may not add permissions inheritance to ${addedParents[i]}`}, req.headers.accept, req.url) 
                } else
                  if (++count == addedParents.length) {
                    addOK = true
                    if (removeOK) {
                      responded = true
                      rLib.found(res, positiveResult(), req.headers.accept, req.url)
                    }
                  }
            })
        }
        if (removedParents.length == 0 && addedParents.length == 0)
          rLib.found(res, positiveResult(), req.headers.accept, req.url)
      } else
        rLib.found(res, {result: false, reason: `may not add cycle to permisions inheritance`}, req.headers.accept, req.url) // cycles not allowed
    })
  }
  var queryParts = querystring.parse(queryString)
  var subject = queryParts.subject
  var sharingSet = queryParts.sharingSet || []
  let user = queryParts.user
  var sharingSets = (Array.isArray(sharingSet) ? sharingSet : [sharingSet]).map(anURL => lib.internalizeURL(anURL, req.headers.host))
  ifUserMatchesRequestTokenThen(req, res, user, () => {
    withActorsForUserDo(req, res, user, function(actors) {
      if (subject === undefined) 
        checkPotentialAncestors(user, actors, [], [], sharingSets)
      else {
        subject = lib.internalizeURL(subject, req.headers.host)
        withPermissionFlagDo(req, res, user, actors, subject, '_self', 'admin', false, function(answer) {
          if (answer)
            withExistingAncestorsDo(subject, existingAncestors => {
              withExistingParentsDo(subject, existingParents => {
                checkPotentialAncestors(user, actors, existingParents, existingAncestors, sharingSets)
              })
            })
          else
            rLib.forbidden(res)
        })
      }
    })
  })
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
    if (event.data.action == 'update') {
      var team = event.data.after
      sortAndSplitRoles(team.roles) 
      addToTeamsCache(event.data.subject, team)    
    } else if (event.data.action == 'delete')
      deleteFromTeamsCache(event.data.url)
    else if (event.data.action == 'create') {
      var members = event.data.team.members
      if (members !== undefined)
        for (let member of members)
          delete actorsForUserCache[member]
    } else if (event.data.action == 'deleteAll') {
      resetTeamsCache()
    }
  }    
}

function processEventPost(req, res, event) {
  permissionsEventConsumer.processEvent(event)
  rLib.ok(res, req.headers.accept, req.url)
}

var IPADDRESS = process.env.PORT !== undefined ? `${process.env.IPADDRESS}:${process.env.PORT}` : process.env.IPADDRESS
var permissionsEventConsumer = new pge.eventConsumer(IPADDRESS, processEvent)

function requestHandler(req, res) {
  if (req.url == '/az-events')
    if (req.method == 'POST')
      lib.getServerPostObject(req, res, (e) => processEventPost(req, res, e))
    else 
      rLib.methodNotAllowed(res, ['POST'])
  else {
    var req_url = url.parse(req.url)
    if (req_url.pathname == '/az-allowed-actions' && req_url.search !== null)
      if (req.method == 'GET')
        getAllowedActions(req, res, lib.internalizeURL(req_url.query, req.headers.host))
      else
        rLib.methodNotAllowed(res, ['GET'])
    else if (req_url.pathname == '/az-is-allowed' && req_url.search == null)
      if (req.method == 'POST')
        lib.getServerPostObject(req, res, (body) => isAllowed(req, res, body))
      else
        rLib.methodNotAllowed(res, ['POST'])
    else if (req_url.pathname == '/az-is-allowed' && req_url.search !== null)
      if (req.method == 'GET')
        isAllowed(req, res, req_url.query)
      else
        rLib.methodNotAllowed(res, ['GET'])
    else if (req_url.pathname == '/az-are-any-allowed' && req_url.search == null)
      if (req.method == 'POST')
        lib.getServerPostObject(req, res, (body) => areAnyAllowed(req, res, body))
      else
        rLib.methodNotAllowed(res, ['GET'])
    else if (req_url.pathname == '/az-are-any-allowed' && req_url.search !== null)
      if (req.method == 'GET')
        areAnyAllowed(req, res, querystring.parse(req_url.query))
      else
        rLib.methodNotAllowed(res, ['GET'])
    else if (req_url.pathname == '/az-is-allowed-to-inherit-from' && req_url.search !== null)
      if (req.method == 'GET')
        isAllowedToInheritFrom(req, res, req_url.query)
      else
        rLib.methodNotAllowed(res, ['GET'])
    else
      rLib.notFound(res, `//${req.headers.host}${req.url} not found`)
  }
}

function init(callback) {
  db.init(function () {
    permissionsEventConsumer.init(callback)
  })
}

function run() {
  init(function() {
    var port = process.env.PORT
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
      paths: ['/az-events', '/az-allowed-actions' , '/az-is-allowed', '/az-are-any-allowed', '/az-is-allowed-to-inherit-from'],
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
