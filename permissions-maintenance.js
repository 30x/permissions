'use strict';
/* 
We dislike prerequisites and avoid them where possible. We especially dislike prereqs that have a 'framework' style; 
simple libraries are more palatable.
Please do not add any framework to this preqs. We do not want express or anything like it. We do not want any sort of "ORM" or similar.
Adding simple library prereqs could be OK if the value they bring is in proportion to their size and complexity 
and is warranted by the difficulty of the problem being solved.
*/
var http = require('http');
var url = require('url');
var querystring = require('querystring');
var lib = require('http-helper-functions');
var db = require('./permissions-maintenance-db.js');

var PROTOCOL = process.env.PROTOCOL || 'http:';
var ANYONE = 'http://apigee.com/users/anyone';
var INCOGNITO = 'http://apigee.com/users/incognito';

function verifyPermissions(req, permissions, user) {
  var rslt = lib.setStandardCreationProperties(req, permissions, user);
  if (rslt !== null) {
    return result;
  }
  if (permissions.isA == undefined && permissions.governs !== undefined) {
    permissions.isA = 'Permissions';
  }
  if (permissions.isA != 'Permissions') {
    return 'invalid JSON: "isA" property not set to "Permissions"';
  }
  if (permissions.inheritsPermissionsOf !== undefined) {
    return 'inheritsPermissionsOf for a Permissions resource independent of inheritsPermissionsOf for the resource it governs not supported'
  }
  if (permissions.governs === undefined) {
    return 'invalid JSON: "governs" property not set';
  }
  var governed = permissions.governs;
  if (governed._self === undefined) {
    return 'must provide _self for governed resource'
  }
  if (governed.inheritsPermissionsOf !== undefined && !Array.isArray(governed.inheritsPermissionsOf)) {
    return 'inheritsPermissionsOf must be an Array'
  }
  if (permissions.updaters === undefined && governed.inheritsPermissionsOf === undefined) {
    permissions.updaters = [user];
    permissions.readers = [user];
    permissions.writers = [user];
  }
  return null;
}

var OPERATIONPROPERTIES = ['creators', 'readers', 'updaters', 'deleters'];
var OPERATIONS = ['create', 'read', 'update', 'delete'];

function calculateSharedWith(req, permissions) {
  function listUsers (obj, result) {
    for (var i = 0; i < OPERATIONPROPERTIES.length; i++) {
      var actors = obj[OPERATIONPROPERTIES[i]];
      if (actors !== undefined) {
        for (var j = 0; j < actors.length; j++) {result[actors[j]] = true;}
      }
    }
  }
  var result = {};
  listUsers(permissions, result);
  listUsers(permissions.governs, result);
  permissions._sharedWith = Object.keys(result);
}

function createPermissions(req, res, permissions) {
  var user = lib.getUser(req);
  if (user == null) {
    lib.unauthorized(req, res)
  } else {
    var err = verifyPermissions(req, permissions, user);
    if (err === null) {
      err = lib.setStandardCreationProperties(permissions, req, user);
    }
    if (err === null) {
      function primCreate(req, res, permissions) {
        calculateSharedWith(req, permissions);
        db.createPermissionsThen(req, res, permissions, function(etag) {
          addCalculatedProperties(req, permissions);
          lib.created(req, res, permissions, permissions._self, etag);
        });        
      }
      var sharingSets = permissions.governs.inheritsPermissionsOf;
      if (sharingSets !== undefined && sharingSets.length > 0) {
        sharingSets = sharingSets.map(x => lib.internalizeURL(x));
        var subject = lib.internalizeURL(permissions.governs._self);
        if (sharingSets.indexOf(subject) == -1) {
          var count = 0;
          for (var i=0; i < sharingSets.length; i++) {
            var sharingSet = sharingSets[i];
            var allowedByAll = true;
            lib.withAllowedDo(req, res, `/permissions?${sharingSet}`, 'create', function(allowed) {
              allowedByAll = allowedByAll && allowed;
              if (++count == sharingSets.length) {
                if (allowedByAll) {
                  primCreate(req, res, permissions);
                } else {
                  lib.forbidden(req, res);
                }
              } 
            });
          }
        } else {
          lib.badRequest(res, `cannot inherit from self: ${subject} inheritsFrom: ${sharingSets}`);
        }
      } else {
        primCreate(req, res, permissions);
      }
    } else {
      lib.badRequest(res, err);
    }
  }
}

function addCalculatedProperties(req, permissions) {
  permissions._self = PROTOCOL + '//' + req.headers.host + '/permissions?' + permissions.governs._self;
}

function getPermissions(req, res, subject) {
  ifAllowedDo(req, res, subject, 'read', true, function(permissions, etag) {
    lib.found(req, res, permissions, etag);
  });
}

function deletePermissions(req, res, subject) {
  ifAllowedDo(req, res, subject, 'delete', true, function() {
    db.deletePermissionsThen(req, res, subject, function(permissionsRow, eventRow) {
      addCalculatedProperties(req, permissions); 
      lib.found(req, res, permissionsRow.data, permissionsRow.etag);
    });
  });
}

function updatePermissions(req, res, patch) {
  var subject = url.parse(req.url).search.substring(1);
  ifAllowedDo(req, res, subject, 'update', true, function(permissions, etag) {
    if (req.headers['if-match'] == etag) { 
      var patchedPermissions = lib.mergePatch(permissions, patch);
      calculateSharedWith(req, patchedPermissions);
      db.updatePermissionsThen(req, res, subject, patchedPermissions, etag, function(patchedPermissions, etag, event) {
        addCalculatedProperties(req, patchedPermissions); 
        lib.found(req, res, permissions, etag);
      });
    } else {
      var err;
      if (req.headers['if-match'] === undefined) {
        err = 'missing If-Match header' + JSON.stringify(req.headers);
      } else {
        err = 'If-Match header does not match etag ' + req.headers['If-Match'] + ' ' + etag;
      }
      lib.badRequest(res, err);
    }
  });
}

function ifAllowedDo(req, res, subject, action, subjectIsPermission, callback) {
  var realSubject = subjectIsPermission ? `/permissions?${subject}` : subject;
  lib.withAllowedDo(req, res, realSubject, action, function(answer) {
    if (answer) {
      if (subjectIsPermission) {
        db.withPermissionsDo(req, res, subject, function(permissions, etag) {
          callback(permissions, etag);
        });
      } else {
        callback();
      }
    } else {
      lib.forbidden(req, res)
    }
  });
}

function addUsersWhoCanSee(req, res, permissions, result, callback) {
  var sharedWith = permissions._sharedWith;
  if (sharedWith !== undefined) {
    for (var i=0; i < sharedWith.length; i++) {
      result[sharedWith[i]] = true;
    }
  }
  var sharingSets = permissions.governs.inheritsPermissionsOf;
  if (sharingSets !== undefined) {
    var count = 0;
    for (var j = 0; j < sharingSets.length; j++) {
      ifAllowedDo(req, res, sharingSets[j], 'read', true, function(permissions, etag) {
        addUsersWhoCanSee(req, res, permissions, result, function() {if (++count == sharingSets.length) {callback();}});
      });
    }
  } else {
    callback();
  }
}

function getUsersWhoCanSee(req, res, resource) {
  var result = {};
  resource = lib.internalizeURL(resource, req.headers.host);
  ifAllowedDo(req, res, resource, 'read', true, function (permissions, etag) {
    addUsersWhoCanSee(req, res, permissions, result, function() {
      lib.found(req, res, Object.keys(result));
    });
  });
}

function getResourcesSharedWith(req, res, user) {
  var requestingUser = lib.getUser(req);
  user = lib.internalizeURL(user, req.headers.host);
  if (user == requestingUser || user == INCOGNITO || (requestingUser !== null && user == ANYONE)) {
    lib.withTeamsDo(req, res, user, function(actors) {
      db.withResourcesSharedWithActorsDo(req, res, actors, function(resources) {
        lib.found(req, res, resources);
      });
    });
  } else {
    lib.forbidden(req, res)
  }
}

function getPermissionsHeirs(req, res, securedObject) {
  ifAllowedDo(req, res, securedObject, 'read', false, function() {
    db.withHeirsDo(req, res, securedObject, function(heirs) {
      lib.found(req, res, heirs);
    });
  });
}

function requestHandler(req, res) {
  if (req.url == '/permissions') {
    if (req.method == 'POST') {
      lib.getServerPostBody(req, res, createPermissions);
    } else { 
      lib.methodNotAllowed(req, res, ['POST']);
    }
  } else {
    var req_url = url.parse(req.url);
    if (req_url.pathname == '/permissions' && req_url.search !== null) {
      if (req.method == 'GET') { 
        getPermissions(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host));
      } else if (req.method == 'DELETE') { 
        deletePermissions(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host));
      } else if (req.method == 'PATCH') { 
        lib.getServerPostBody(req, res, updatePermissions);
      } else {
        lib.methodNotAllowed(req, res, ['GET', 'DELETE', 'PATCH']);
      }
    } else if (req_url.pathname == '/resources-shared-with' && req_url.search !== null) {
      if (req.method == 'GET') {
        getResourcesSharedWith(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host));
      } else {
        lib.methodNotAllowed(req, res, ['GET']);
      }
    } else  if (req_url.pathname == '/permissions-heirs' && req_url.search !== null) {
      if (req.method == 'GET') {
        getPermissionsHeirs(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host));
      } else {
        lib.methodNotAllowed(req, res, ['GET']);
      }
    } else if (req_url.pathname == '/users-who-can-access' && req_url.search !== null) {
      if (req.method == 'GET') {
        getUsersWhoCanSee(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host));
      } else {
        lib.methodNotAllowed(req, res, ['GET']);
      }
    } else {
      lib.notFound(req, res);
    }
  }
}

var port = process.env.PORT;
db.init(function(){
  http.createServer(requestHandler).listen(port, function() {
    console.log(`server is listening on ${port}`);
  });
});
