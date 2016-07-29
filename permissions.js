'use strict';
var http = require('http');
var lib = require('./standard-functions.js');
var crud = require('./permissions-crud.js');

var permissionsCache = {};
var userCache = {};
var teamCache = {};

var PROTOCOL = process.env.PROTOCOL || 'http:';

function withTeamsDo(req, user, callback) {
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
          callback(null, actors);
        } else {
          callback(client_response.statusCode, user);
        }
      });
    });
    client_req.on('error', function (err) {
      callback(err, user);
    });
    client_req.end();
  } else {
    callback(null, user, null);
  }
}

function addAllowedActions(req, data, actors, result, permissionsOfPermissions, action, recursion_set, callback) {
  var permissions;
  if (permissionsOfPermissions) { 
    permissions = data;
  } else {
    permissions = data.governs;
  }
  for (var i = 0; i < OPERATIONPROPERTIES.length; i++) {
    if (permissions[OPERATIONPROPERTIES[i]] !== undefined) {
      if (actors === null) {
        if (permissions[OPERATIONPROPERTIES[i]].indexOf(INCOGNITO) > -1) { 
          result[OPERATIONS[i]] = true;
        }
      } else {
        for (var j=0; j<actors.length; j++) {
          var user = actors[j];
          if (permissions[OPERATIONPROPERTIES[i]].indexOf(ANYONE) > -1 ||
              permissions[OPERATIONPROPERTIES[i]].indexOf(user) > -1 ) { 
            result[OPERATIONS[i]] = true;
          }
        }
      }
    }
  }
  var inheritsPermissionsOf = data.governs.inheritsPermissionsOf;
  if (inheritsPermissionsOf !== undefined) {
    inheritsPermissionsOf = inheritsPermissionsOf.filter((x) => {return !(x in recursion_set);})
  } 
  if (!(action in result) && inheritsPermissionsOf !== undefined && inheritsPermissionsOf.length > 0) {
    var count = 0;
    for (var j = 0; j < inheritsPermissionsOf.length; j++) {
      withPermissionsDo(req, inheritsPermissionsOf[j], actors, result, permissionsOfPermissions, action, recursion_set, function() {
        if (++count == inheritsPermissionsOf.length) {
          callback(200);
        }
      });
    }
  } else {
    callback(200);
  }
}

function getPermissionsThen(req, resource, callback) {
  var permissions = permissionsCache[resource];
  if (permissions !== undefined) {
    callback(null, permissions);
  } else {
    crud.getPermissionsThen(req, null, resource, function(err, permissions, etag) {
      if (err == null) {
        permissionsCache[resource] = permissions;
      }
      callback(err, permissions)
    });
  }
}

function primIfAllowedThen(req, user, resource, action, permissionsOfPermissions, callback) {}

function ifAllowedThen(req, user, resource, action, permissionsOfPermissions, callback) {
  withTeamsDo(req, user, function() {

  });
  
  getPermissionsThen(req, resource, function(err, permissions) {
    if (err !== null) {
      callback(err);
    } else {
      var permissionsObject = permissions.governs;
      if (permissionsOfPermissions) {permissionsObject = permissions;}
      var allowedActors = permissionsObject[action];
      if (action in permissionsObject) {
        for (var i; i < allowedActors; i++) {}
        callback(null);
      } else {
        callback()
      }
    }
  });
}

exports.withTeamsDo = withTeamsDo;
exports.ifAllowedThen = ifAllowedThen;