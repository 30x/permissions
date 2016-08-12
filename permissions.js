'use strict';
var http = require('http');
var lib = require('http-helper-functions');
var db = require('./permissions-db.js');
var querystring = require('querystring');
var url = require('url');
var pge = require('pg-event-consumer');

var PROTOCOL = process.env.PROTOCOL || 'http:';
var ANYONE = 'http://apigee.com/users/anyone';
var INCOGNITO = 'http://apigee.com/users/incognito';

var OPERATIONPROPERTIES = ['grantsCreateAcessTo', 'grantsReadAccessTo', 'grantsUpdateAccessTo', 'grantsDeleteAccessTo', 'grantsAddAccessTo', 'grantsRemoveAccessTo'];
var OPERATIONS = ['create', 'read', 'update', 'delete', 'add', 'remove'];

function withTeamsDo(req, res, user, callback) {
  return lib.withTeamsDo(req, res, user, callback)
}

function getAllowedActions(req, res, queryString) {
  var queryParts = querystring.parse(queryString);
  var resource = lib.internalizeURL(queryParts.resource, req.headers.host);
  var user = queryParts.user;
  var property = queryParts.property || '_resource';
  if (user == lib.getUser(req)) { 
    withAllowedActionsDo(req, res, resource, property, function(allowedActions) {
      lib.found(req, res, allowedActions);
    });
  } else {
    lib.badRequest(res, 'user in query string must match user credentials')
  }
}

function collateAllowedActions(permissionsObject, property, actors) {
  permissionsObject = permissionsObject[property];
  if (permissionsObject !== undefined) {
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
  }
  return allowedActions;
}

function isActionAllowed(permissionsObject, property, actors, action) {
  permissionsObject = permissionsObject[property];
  if (permissionsObject !== undefined) {
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

function withPermissionFlagDo(req, res, subject, property, action, callback) {
  var recursionSet = {};
  function ifActorsAllowedDo(actors, resource, callback) {
    withPermissionsDo(req, res, resource, function(permissions) {
      var allowed = isActionAllowed(permissions, property, actors, action, property);
      if (allowed) {
        callback(true);
      } else {
        var inheritsPermissionsOf = permissions._permissions.inheritsPermissionsOf;
        if (inheritsPermissionsOf !== undefined) {
          inheritsPermissionsOf = inheritsPermissionsOf.filter(x => !(x in recursionSet)); 
          if (inheritsPermissionsOf.length > 0) {
            var count = 0;
            for (var j = 0; j < inheritsPermissionsOf.length; j++) {
              recursionSet[inheritsPermissionsOf[j]] = true; 
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

function withAllowedActionsDo(req, res, resource, property, callback) {
  var recursionSet = {};
  function withActorsAllowedActionsDo(req, res, actors, resource, property, callback) {
    withPermissionsDo(req, res, resource, function(permissions) {
      var actions = collateAllowedActions(permissions, property, actors);
      var inheritsPermissionsOf = permissions._permissions.inheritsPermissionsOf;
      if (inheritsPermissionsOf !== undefined) {
        inheritsPermissionsOf = inheritsPermissionsOf.filter(x => !(x in recursionSet)); 
        if (inheritsPermissionsOf.length > 0) {
          var count = 0;
          for (var j = 0; j < inheritsPermissionsOf.length; j++) {
            withActorsAllowedActionsDo(req, res, actors, resource, property, function(nestedActions) {
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
    withActorsAllowedActionsDo(req, res, actors, resource, property, function(actions) {
      callback(Object.keys(actions));
    });
  });
}

function isAllowed(req, res, queryString) {
  var queryParts = querystring.parse(queryString);
  var user = queryParts.user;
  var action = queryParts.action;
  var property = queryParts.property;
  if (action !== undefined && queryParts.resource !== undefined && user == lib.getUser(req)) {
    var resources = Array.isArray(queryParts.resource) ? queryParts.resource : [queryParts.resource];
    resources = resources.map(x => lib.internalizeURL(x));
    var count = 0;
    var result = true;
    var responded = false;
    for (var i = 0; i< resources.length; i++) {
      var resource = resources[i];
      var resourceParts = url.parse(resource);
      withPermissionFlagDo(req, res, resource, property, action, function(answer) {
        if (!responded) {
          if (++count == resources.length) {
            lib.found(req, res, answer && result);
          } else if (answer == false) {
            lib.found(req, res, false);
            responded = true;
          }
        }
      });
    }
  } else {
    lib.badRequest(res, 'action and resource must be provided and user in query string must match user credentials ' + req.url)
  }
}

function withInheritsPermissionsFrom(req, res, resource, sharingSets, callback) {
  if (sharingSets === undefined || sharingSets.length == 0) {
    callback(false);
  } else {
    var responded = false;
    var count = 0;
    for (var i=0; i < sharingSets.length; i++) {
      withPermissionsDo(req, res, sharingSets[i], function(permissions) {
        if (!responded) {
          var sharingSets = permissions._permissions.inheritsPermissionsOf;
          if (sharingSets !== undefined && sharingSets.length > 0) {
            if (sharingSets.indexOf(resource) > -1) { // reply true
              responded = true;
              callback(true);
            } else {
              withInheritsPermissionsFrom(req, res, resource, sharingSets, function(inherits) {
                if (!responded) {
                  if (inherits) {
                    responded = true;
                    callback(true);
                  } else {
                    if (++count == sharingSets.length) {
                      callback(false);
                    }
                  }
                }
              });
            }
          } else { // no sharingSets 
            if (++count == sharingSets.length) { // if this is the last nested response, reply 
              callback(false);
          }
        }
      }
    });
  }
  }
}

function inheritsPermissionsFrom(req, res, queryString) {
  var queryParts = querystring.parse(queryString);
  var resource = lib.internalizeURL(queryParts.resource, req.headers.host);
  withPermissionFlagDo(req, res, resource, '_permissions', 'read', function(answer) {
    if (answer) {
      var sharingSet = queryParts.sharingSet;
      var sharingSets = Array.isArray(sharingSet) ? sharingSet : [sharingSet];
      sharingSets = sharingSets.map(anURL => lib.internalizeURL(anURL));
      withInheritsPermissionsFrom(req, res, resource, sharingSets, function(result){
        lib.found(req, res, result);
      });
    } else{
      lib.forbidden(req, res)
    }
  });
}

function primProcessEvent(event) {
  if (event.topic == '_permissions') {
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
    } else if (req_url.pathname == '/inherits-permissions-from' && req_url.search !== null) {
      if (req.method == 'GET') {
        inheritsPermissionsFrom(req, res, req_url.search.substring(1));
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
