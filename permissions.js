'use strict';
var http = require('http');
var lib = require('./standard-functions.js');
var crud = require('./permissions-crud.js');

var permissionsCache = {};
var userCache = {};
var teamCache = {};

var PROTOCOL = process.env.PROTOCOL || 'http:';
var ANYONE = 'http://apigee.com/users/anyone';
var INCOGNITO = 'http://apigee.com/users/incognito';
var OPERATIONPROPERTIES = ['creators', 'readers', 'updaters', 'deleters'];
var OPERATIONS = ['create', 'read', 'update', 'delete'];

function withTeamsDo(req, res, user, callback) {
  if (user !== null) {
    var headers = {
      'Accept': 'application/json'
    }
    if (req.headers.authorization !== undefined) {
      headers.authorization = req.headers.authorization; 
    }
    var hostParts = req.headers.host.split(':');
    var options = {
      protocol: PROTOCOL,
      hostname: hostParts[0],
      path: '/teams?' + user,
      method: 'GET',
      headers: headers
    };
    if (hostParts.length > 1) {
      options.port = hostParts[1];
    }
    var client_req = http.request(options, function (client_response) {
      lib.getClientResponseBody(client_response, function(body) {
        if (client_response.statusCode == 200) { 
          var actors = JSON.parse(body);
          actors.push(user);
          lib.internalizeURLs(actors, req.headers.host);
          callback(actors);
        } else {
          lib.internalError(res, client_response.statusCode);
        }
      });
    });
    client_req.on('error', function (err) {
      lib.internalError(res, err);
    });
    client_req.end();
  } else {
    callback(null);
  }
}

function getAllowedActions(permissionsObject, actors) {
  var allowedActions = {};
  for (var i = 0; i < OPERATIONPROPERTIES.length; i++) {
    var actionProperty = OPERATIONPROPERTIES[i];
    if (permissionsObject[actionProperty] !== undefined) {
      if (permissionsObject[actionProperty].indexOf(INCOGNITO) > -1) { 
        allowedActions[OPERATIONS[i]] = true;
      } else if (actors !== null) {
        for (var j=0; j<actors.length; j++) {
          var user = actors[j];
          if (permissionsObject[actionProperty].indexOf(ANYONE) > -1 ||
              permissionsObject[actionProperty].indexOf(user) > -1 ) { 
            allowedActions[OPERATIONS[i]] = true;
          }
        }
      }
    }
  }
  return allowedActions;
}

function isActionAllowed(permissionsObject, actors, action) {
  var actionProperty = OPERATIONPROPERTIES[OPERATIONS.indexOf(action)];
  if (permissionsObject[actionProperty] !== undefined) {
    if (permissionsObject[actionProperty].indexOf(INCOGNITO) > -1) { 
      return true;
    } else if (actors !== null) {
      for (var j=0; j<actors.length; j++) {
        var user = actors[j];
        if (permissionsObject[actionProperty].indexOf(ANYONE) > -1 ||
            permissionsObject[actionProperty].indexOf(user) > -1 ) { 
          return true;
        }
      }
    }
  }
  return false;
}

function cache(resource, permissions, etag) {
  permissionsCache[resource] = permissions;
}

function getPermissionsThen(req, res, resource, callback) {
  var permissions = permissionsCache[resource];
  if (permissions !== undefined) {
    callback(permissions);
  } else {
    crud.getPermissionsThen(req, res, resource, function(err, permissions, etag) {
      cache(resource, permissions, etag);
      callback(permissions);
    });
  }
}

function ifAllowedDo(req, res, resource, action, permissionsOfPermissions, callback) {
  var recursionSet = {};
  function ifActorsAllowedDo(req, res, actors, resource, action, permissionsOfPermissions, callback) {
    getPermissionsThen(req, res, resource, function(permissions) {
      var allowed = isActionAllowed(permissionsOfPermissions ? permissions : permissions.governs, actors, action);
      if (allowed) {
        callback();
      } else {
        var inheritsPermissionsOf = permissions.governs.inheritsPermissionsOf;
        if (inheritsPermissionsOf !== undefined) {
          inheritsPermissionsOf = inheritsPermissionsOf.filter((x) => {return !(x in recursionSet);}) 
          if (inheritsPermissionsOf.length > 0) {
            var count = 0;
            for (var j = 0; j < inheritsPermissionsOf.length; j++) {
              ifActorsAllowedThen(req, res, actors, inheritsPermissionsOf[j], action, permissionsOfPermissions, function() {
                if (++count == inheritsPermissionsOf.length) {
                  callback();
                }
              });
            }
          } else {
            lib.forbidden(req, res);
          }
        } else {
          lib.forbidden(req, res);
        }
      }
    });
  }
  var user = lib.getUser(req);
  withTeamsDo(req, res, user, function(actors) {  
    ifActorsAllowedDo(req, res, actors, resource, action, permissionsOfPermissions, callback)
  });
}

function withAllowedActionsDo(req, res, resource, permissionsOfPermissions, callback) {
  var recursionSet = {};
  function withActorsAllowedActionsDo(req, res, actors, resource, permissionsOfPermissions, callback) {
    getPermissionsThen(req, res, resource, function(permissions) {
      var actions = getAllowedActions(permissionsOfPermissions ? permissions : permissions.governs, actors);
      var inheritsPermissionsOf = permissions.governs.inheritsPermissionsOf;
      if (inheritsPermissionsOf !== undefined) {
        inheritsPermissionsOf = inheritsPermissionsOf.filter((x) => {return !(x in recursionSet);}) 
        if (inheritsPermissionsOf.length > 0) {
          var count = 0;
          for (var j = 0; j < inheritsPermissionsOf.length; j++) {
            withActorsAllowedActionsDo(req, res, actors, resource, actions, permissionsOfPermissions, function(nestedActions) {
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
    withActorsAllowedActionsDo(req, res, actors, resource, permissionsOfPermissions, function(actions) {
      callback(Object.keys(actions));
    });
  });
}

exports.withTeamsDo = withTeamsDo;
exports.ifAllowedDo = ifAllowedDo;
exports.withAllowedActionsDo = withAllowedActionsDo;
exports.cache = cache;