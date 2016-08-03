'use strict';
var http = require('http');
var lib = require('./standard-functions.js');
var db = require('./permissions-db.js');
var querystring = require('querystring');
var url = require('url');

var permissionsCache = {};
var teamsCache = {};

var PROTOCOL = process.env.PROTOCOL || 'http:';
var ANYONE = 'http://apigee.com/users/anyone';
var INCOGNITO = 'http://apigee.com/users/incognito';
var OPERATIONPROPERTIES = ['creators', 'readers', 'updaters', 'deleters'];
var OPERATIONS = ['create', 'read', 'update', 'delete'];

function withTeamsDo(req, res, user, callback) {
  return lib.withTeamsDo(req, res, user, callback)
}

function getAllowedActions(req, res, queryString) {
  var queryParts = querystring.parse(queryString);
  var resource = lib.internalizeURL(queryParts.resource, req.headers.host);
  var user = queryParts.user
  if (user == lib.getUser(req)) { 
    withAllowedActionsDo(req, res, resource, false, function(allowedActions) {
      lib.found(req, res, allowedActions);
    });
  } else {
    lib.badRequest(res, 'user in query string must match user credentials')
  }
}

function collateAllowedActions(permissionsObject, actors) {
  var allowedActions = {};
  for (var i = 0; i < OPERATIONPROPERTIES.length; i++) {
    var actionProperty = OPERATIONPROPERTIES[i];
    var allowedActors = permissionsObject[actionProperty];
    if (allowedActors !== undefined) {
      if (allowedActors.indexOf(INCOGNITO) > -1) { 
        allowedActions[OPERATIONS[i]] = true;
      } else if (actors !== null) {
        if (allowedActors.indexOf(ANYONE) > -1) {
          allowedActions[OPERATIONS[i]] = true;          
        } else {
          for (var j=0; j<actors.length; j++) {
            var user = actors[j];
            if (allowedActors.indexOf(user) > -1 ) { 
              allowedActions[OPERATIONS[i]] = true;
            }
          }
        }
      }
    }
  }
  return allowedActions;
}

function isActionAllowed(permissionsObject, actors, action) {
  var actionProperty = OPERATIONPROPERTIES[OPERATIONS.indexOf(action)];
  var allowedActors = permissionsObject[actionProperty];
  if (allowedActors !== undefined) {
    if (allowedActors.indexOf(INCOGNITO) > -1) { 
      return true;
    } else if (actors !== null) {
      if (allowedActors.indexOf(ANYONE) > -1) {
        return true;
      } else {
        for (var j=0; j<actors.length; j++) {
          var actor = actors[j];
          if (allowedActors.indexOf(actor) > -1 ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function cache(resource, permissions, etag) {
  permissions._Etag = etag;
  permissionsCache[resource] = permissions;
}

function invalidate(resource) {
  delete permissionsCache[lib.internalizeURL(resource)];
}

function withPermissionsDo(req, res, resource, callback) {
  var permissions = permissionsCache[resource];
  if (permissions !== undefined) {
    callback(permissions, permissions._Etag);
  } else {
    db.withPermissionsDo(req, res, resource, function(permissions, etag) {
      cache(resource, permissions, etag);
      callback(permissions, etag);
    });
  }
}

function withPermissionFlagDo(req, res, subject, action, subjectIsPermission, callback) {
  subject = lib.internalizeURL(subject);
  var recursionSet = {};
  var originalPermissons = null;
  function ifActorsAllowedDo(actors, resource, callback) {
    withPermissionsDo(req, res, resource, function(permissions) {
      if (subjectIsPermission && resource == subject) {
        originalPermissons = permissions;
      }
      var allowed = isActionAllowed(subjectIsPermission ? permissions : permissions.governs, actors, action);
      if (allowed) {
        if (subjectIsPermission) {
          callback(true, JSON.parse(JSON.stringify(originalPermissons)), originalPermissons._Etag)
        } else {
          callback(true);
        }
      } else {
        var inheritsPermissionsOf = permissions.governs.inheritsPermissionsOf;
        if (inheritsPermissionsOf !== undefined) {
          inheritsPermissionsOf = inheritsPermissionsOf.filter((x) => {return !(x in recursionSet);}) 
          if (inheritsPermissionsOf.length > 0) {
            var count = 0;
            for (var j = 0; j < inheritsPermissionsOf.length; j++) {
              ifActorsAllowedDo(actors, inheritsPermissionsOf[j], function() {
                if (++count == inheritsPermissionsOf.length) {
                  if (subjectIsPermission) {
                    callback(true, JSON.parse(JSON.stringify(originalPermissons)), originalPermissons._Etag)
                  } else {
                    callback(true);
                  }
                }
              });
            }
          } else {
            callback(false);
          }
        } else {
          callback(false);
        }
      }
    });
  }
  var user = lib.getUser(req);
  withTeamsDo(req, res, user, function(actors) {  
    ifActorsAllowedDo(actors, subject, callback);
  });
}

function withAllowedActionsDo(req, res, resource, subjectIsPermission, callback) {
  var recursionSet = {};
  function withActorsAllowedActionsDo(req, res, actors, resource, subjectIsPermission, callback) {
    withPermissionsDo(req, res, resource, function(permissions) {
      var actions = collateAllowedActions(subjectIsPermission ? permissions : permissions.governs, actors);
      var inheritsPermissionsOf = permissions.governs.inheritsPermissionsOf;
      if (inheritsPermissionsOf !== undefined) {
        inheritsPermissionsOf = inheritsPermissionsOf.filter((x) => {return !(x in recursionSet);}) 
        if (inheritsPermissionsOf.length > 0) {
          var count = 0;
          for (var j = 0; j < inheritsPermissionsOf.length; j++) {
            withActorsAllowedActionsDo(req, res, actors, resource, actions, subjectIsPermission, function(nestedActions) {
              Object.assign(actions, nestedActions);
              if (++count == inheritsPermissionsOf.length) {
                callback(actions);
              }
            });
          }
        } else {
          callback(actions);
        }
      } else {
        callback(actions);
      }
    });
  }
  var user = lib.getUser(req);
  withTeamsDo(req, res, user, function(actors) {  
    withActorsAllowedActionsDo(req, res, actors, resource, subjectIsPermission, function(actions) {
      callback(Object.keys(actions));
    });
  });
}

function isAllowed(req, res, queryString) {
  var queryParts = querystring.parse(queryString);
  var resource = lib.internalizeURL(queryParts.resource);
  var user = queryParts.user;
  var action = queryParts.action;
  var resourceParts = url.parse(resource);
  var subjectIsPermission = false;
  if (resourceParts.pathname == '/permissions' && resourceParts.search != null) {
    subjectIsPermission = true;
    resource = resourceParts.search.substring(1);
  }
  if (action !== undefined && resource !== undefined && user == lib.getUser(req)) {
    withPermissionFlagDo(req, res, resource, action, subjectIsPermission, function(answer) {
      lib.found(req, res, answer);
    });
  } else {
    lib.badRequest(res, 'action and resource must be provided and user in query string must match user credentials ' + req.url)
  }
}

function processPermissionsModification(req, res, modification) {
  invalidate(modification.subject)
}

// cache handling

function processStoredInvalidations(invalidations) {
  for (var i = 0; i < invalidations.length; i++) {
    var invalidation = invalidations[i];
    var cacheEntry = permissionsCache[invalidation.subject];
    if (cacheEntry !== undefined) {
      if (cacheEntry.etag < invalidation.etag) {
        console.log(`processing missed invalidation: ${invalidation.subject}`)
        delete permissionsCache[invalidation.subject];
      }
    }
  }
}

var ONEMINUTE = 60*100;
var TWOMINUTES = 2*60*100;
var TENMINUTES = 10*60*100;
var ONEHOUR = 60*60*100;

var peerCaches = [];

function setPeerCaches(peers) {
  console.log('setPeerCaches:', 'peers:', peers)
  peerCaches = peers;
}

var ipAddress = process.env.PORT !== undefined ? `${process.env.IPADDRESS}:${process.env.PORT}` : process.env.IPADDRESS

var processedInvalidations = new Array(1000);       // TODO convert to typed array to increase efficiency
var lastInvalidationIndex = 0;                      // database index of next expected invalidation. This is the database index of the first entry in processedInvalidations
var highestProcessedInvalidationIndex = 0;          // highest database index of invalidation processed.

function disposeConsecutiveInvalidations() {
  var handled = 0;
  while (processedInvalidations[handled] !== undefined) {handled++;}
  if (handled > 0) {
    console.log(`disposing of ${handled} invalidations`)
    for (var i=0; i < highestProcessedInvalidationIndex - lastInvalidationIndex; i++) {
      processedInvalidations[i] = processedInvalidations[i+handled];
      processedInvalidations[i+handled] = undefined;
    }
    lastInvalidationIndex += handled;
  }
}

function processStoredInvalidations(invalidations) {
  for (var i=0; i< invalidations.length; i++) {
    var invalidation = invalidations[i];    
    console.log('processStoredInvalidation:', 'invalidation:', invalidation.index);
    var index = parseInt(invalidation.index);
    processedInvalidations[index - lastInvalidationIndex - 1] = 1;
    highestProcessedInvalidationIndex = Math.max(highestProcessedInvalidationIndex, index);
  }
  disposeConsecutiveInvalidations();
}

function fetchStoredInvalidations() {
  disposeConsecutiveInvalidations();
  db.withInvalidationsAfter(lastInvalidationIndex, processStoredInvalidations);
}

function init(callback) {
  db.withLastInvalidationID(function(err, id) {
    if (err) {
      console.log('unable to get last value of invalidation ID')
    } else {
      lastInvalidationIndex = id - 1;
      db.registerCache(ipAddress, setPeerCaches);
      setInterval(db.registerCache, ONEMINUTE, ipAddress, setPeerCaches);
      setInterval(db.discardCachesOlderThan, TWOMINUTES, TENMINUTES);
      setInterval(fetchStoredInvalidations, TWOMINUTES);
      setInterval(db.discardInvalidationsOlderThan, TENMINUTES, ONEHOUR);
      callback();
    }
  });  
}

exports.withPermissionFlagDo = withPermissionFlagDo;
exports.withAllowedActionsDo = withAllowedActionsDo;
exports.invalidate = invalidate;
exports.init=init;
exports.isAllowed=isAllowed;
exports.getAllowedActions=getAllowedActions;

// for unit test
exports.disposeConsecutiveInvalidations=disposeConsecutiveInvalidations;
exports.processStoredInvalidations=processStoredInvalidations;
exports.processedInvalidations=processedInvalidations;
exports.lastInvalidationIndex=lastInvalidationIndex;
exports.highestProcessedInvalidationIndex=highestProcessedInvalidationIndex;
