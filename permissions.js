'use strict';
var http = require('http');
var lib = require('./standard-functions.js');
var db = require('./permissions-db.js');
var querystring = require('querystring');
var url = require('url');
var pge = require('./pgEventConsumer.js');

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
  function ifActorsAllowedDo(actors, resource, callback) {
    withPermissionsDo(req, res, resource, function(permissions) {
      var allowed = isActionAllowed(subjectIsPermission ? permissions : permissions.governs, actors, action);
      if (allowed) {
        callback(true);
      } else {
        var inheritsPermissionsOf = permissions.governs.inheritsPermissionsOf;
        if (inheritsPermissionsOf !== undefined) {
          inheritsPermissionsOf = inheritsPermissionsOf.filter((x) => {return !(x in recursionSet);}) 
          if (inheritsPermissionsOf.length > 0) {
            var count = 0;
            for (var j = 0; j < inheritsPermissionsOf.length; j++) {
              ifActorsAllowedDo(actors, inheritsPermissionsOf[j], function() {
                if (++count == inheritsPermissionsOf.length) {
                  callback(true);
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

function primProcessEvent(event) {
  if (event.topic == 'permissions') {
    delete permissionsCache[lib.internalizeURL(event.data.subject)];
  }  
}

function processEvent(req, res, event) {
  permissionsEventConsumer.processEvent(event);
  lib.found(req, res);
}

var IPADDRESS = process.env.PORT !== undefined ? `${process.env.IPADDRESS}:${process.env.PORT}` : process.env.IPADDRESS;
var permissionsEventConsumer = new pge.eventConsumer(db.pool, IPADDRESS, primProcessEvent);

var permissionsCache = {};
var teamsCache = {};

function requestHandler(req, res) {
  if (req.url == '/events') {
    if (req.method == 'POST') {
      lib.getServerPostBody(req, res, processEvent);
    } else { 
      lib.methodNotAllowed(req, res, ['POST']);
    }
  } else {
    var req_url = url.parse(req.url);
    if (req_url.pathname == '/allowed-actions' && req_url.search !== null){ 
      if (req.method == 'GET') {
        getAllowedActions(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host));
      } else {
        lib.methodNotAllowed(req, res, ['GET']);
      }
    } else if (req_url.pathname == '/is-allowed' && req_url.search !== null) {
      if (req.method == 'GET') {
        isAllowed(req, res, req_url.search.substring(1));
      } else {
        lib.methodNotAllowed(req, res, ['GET']);
      }
    } else {
      lib.notFound(req, res);
    }
  }
}

db.init(function () {
  var port = process.env.PORT;
  permissionsEventConsumer.init(function() {
    http.createServer(requestHandler).listen(port, function() {
      console.log(`server is listening on ${port}`);
    });
  });
});
