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
  console.log(user);
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
  allowedActions = {};
  for (var i = 0; i < OPERATIONPROPERTIES.length; i++) {
    var actionProperty = OPERATIONPROPERTIES[i];
    if (permissions[actionProperty] !== undefined) {
      if (permissions[actionProperty].indexOf(INCOGNITO) > -1) { 
        allowedActions[OPERATIONS[i]] = true;
      } else if (actors !== null) {
        for (var j=0; j<actors.length; j++) {
          var user = actors[j];
          if (permissions[actionProperty].indexOf(ANYONE) > -1 ||
              permissions[actionProperty].indexOf(user) > -1 ) { 
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
  if (permissions[actionProperty] !== undefined) {
    if (permissions[actionProperty].indexOf(INCOGNITO) > -1) { 
      return true;
    } else if (actors !== null) {
      for (var j=0; j<actors.length; j++) {
        var user = actors[j];
        if (permissions[actionProperty].indexOf(ANYONE) > -1 ||
            permissions[actionProperty].indexOf(user) > -1 ) { 
          return true;
        }
      }
    }
  }
  return false;
}

function cache(resource, permissions) {
  permissionsCache[resource] = permissions;
}

function getPermissionsThen(req, res, resource, callback) {
  var permissions = permissionsCache[resource];
  if (permissions !== undefined) {
    callback(permissions);
  } else {
    crud.getPermissionsThen(req, res, resource, function(err, permissions, etag) {
      cache(resource, permissions);
      callback(permissions);
    });
  }
}

function ifActorsAllowedThen(req, res, actors, resource, action, permissionsOfPermissions, recursionSet, callback) {
  getPermissionsThen(req, res, resource, function(permissions) {
    var allowed = isActionAllowed(permissionsOfPermissions ? permissions : permissions.governs, actors, action);
    if (allowed) {
      callback();
    } else {
      var inheritsPermissionsOf = data.governs.inheritsPermissionsOf;
      if (inheritsPermissionsOf !== undefined) {
        inheritsPermissionsOf = inheritsPermissionsOf.filter((x) => {return !(x in recursion_set);}) 
        if (inheritsPermissionsOf.length > 0) {
          var count = 0;
          for (var j = 0; j < inheritsPermissionsOf.length; j++) {
            ifActorsAllowedThen(req, res, actors, inheritsPermissionsOf[j], action, permissionsOfPermissions, recursion_set, function() {
              if (++count == inheritsPermissionsOf.length) {
                callback(200);
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

function ifUserAllowedThen(req, res, resource, action, permissionsOfPermissions, callback) {
  var user = lib.getUser(req);
  withTeamsDo(req, res, user, function(actors) {  
    ifActorsAllowedThen(req, res, actors, resource, action, permissionsOfPermissions, {}, callback)
  });
}

exports.withTeamsDo = withTeamsDo;
exports.ifUserAllowedThen = ifUserAllowedThen;