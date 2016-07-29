'use strict';
/* 
We dislike prerequisites and avoid them where possible. We especially dislike prereqs that have a 'framework' style; simple libraries are more palatable.
The current code uses http and pg. Because of Node's callback style, these have a slightly 'frameworky' feel, but it is not practical to avoid these libraries.
Please do not add any framework to this preqs. We do not want express or anything like it. We do not want any sort of "ORM" or similar.
Adding simple library prereqs could be OK if the value they bring is in proportion to the problme being solved.
*/
var http = require('http');
var Pool = require('pg').Pool;
var url = require('url');
var querystring = require('querystring');
var lib = require('./standard-functions.js');
var perm = require('./permissions.js');

var PROTOCOL = process.env.PROTOCOL || 'http:';
var ANYONE = 'http://apigee.com/users/anyone';
var INCOGNITO = 'http://apigee.com/users/incognito';

var config = {
  host: 'localhost',
  user: 'martinnally',
  password: 'martinnally',
  database: 'permissions'
};

var pool = new Pool(config);

function verifyPermissions(req, permissions) {
  if (permissions.isA == undefined && permissions.governs !== undefined) {
    permissions.isA = 'Permissions';
  }
  if (permissions.isA == 'Permissions') {
    if (permissions.inheritsPermissionsOf !== undefined) {
      return 'inheritsPermissionsOf for a Permissions resource independent of inheritsPermissionsOf for the resource it governs not supported'
    } else {
      if (permissions.governs !== undefined) {
        var governed = permissions.governs;
        if (governed._self !== undefined) {
          if (governed.inheritsPermissionsOf !== undefined && !Array.isArray(governed.inheritsPermissionsOf)) {
            return 'inheritsPermissionsOf must be an Array'
          } else {
            var user = lib.getUser(req);
            if (permissions.updaters === undefined && governed.inheritsPermissionsOf === undefined) {
              permissions.updaters = [user];
              permissions.readers = [user];
              permissions.writers = [user];
            }
            return null;
          }
        } else {
          return 'must provide _self for governed resource'
        }
      } else { 
        return 'invalid JSON: "governs" property not set';
      }
    }
  } else { 
    return 'invalid JSON: "isA" property not set to "Permissions"';
  }
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
    var err = verifyPermissions(req, permissions);
    if (err === null) {
      err = lib.setStandardCreationProperties(permissions, req, user);
    }
    if (err === null) {
      calculateSharedWith(req, permissions);
      lib.internalizeURLs(permissions, req.headers.host);
      pool.query('INSERT INTO permissions (subject, data) values($1, $2) RETURNING etag', [permissions.governs._self, permissions], function (err, pg_res) {
        if (err) {
          if (err.code == 23505){ 
            lib.duplicate(res, err);
          } else { 
            lib.badRequest(res, err);
          }
        } else {
          var etag = pg_res.rows[0].etag;
          addCalculatedProperties(permissions, req);
          lib.created(req, res, permissions, permissions._self, etag);
        }
      });
    } else {
      lib.badRequest(res, err);
    }
  }
}

function addCalculatedProperties(permissions, req) {
  permissions._self = PROTOCOL + '//' + req.headers.host + '/permissions?' + permissions.governs._self;
}

function getPermissionsThen(req, res, subject, action, permissionsOfPermissions, callback) {
  // fetch the permissions resource for `subject`. Call the callback only if the user has permissions to perform `action`
  // on subject. This may require walking up the inheritance tree. if `permissionsOfPermisions` is true, the caller
  // is trying to access the permissions document itself, otherwise the subject.
  var query = 'SELECT etag, data FROM permissions WHERE subject = $1'
  var key = lib.internalizeURL(subject, req.headers.host)
  pool.query(query,[key], function (err, pg_res) {
    if (err) {
      lib.badRequest(res, err);
    }
    else {
      if (pg_res.rowCount === 0) { 
        lib.notFound(req, res);
      }
      else {
        var row = pg_res.rows[0];
        var user = lib.getUser(req);
        perm.withTeamsDo(req, user, function(err, actors) {
          if (err) {
            lib.internalError(res, err);
          } else {
            var allowedActions = {};
            var recursion_set = {};
            recursion_set[subject] = true;
            addAllowedActions(req, row.data, actors, allowedActions, permissionsOfPermissions, action, recursion_set, function() {
              if (action in allowedActions) {
                lib.externalizeURLs(row.data, req.headers.host, PROTOCOL);
                addCalculatedProperties(row.data, req); 
                callback(row.data, row.etag);
              } else { 
                lib.forbidden(req, res);
              }
            });
          }
        });
      }
    }
  });
}

function getPermissions(req, res, subject) {
  getPermissionsThen(req, res, subject, 'read', true, function(permissions, etag) {
    lib.found(req, res, permissions, etag);
  });
}

function deletePermissions(req, res, subject) {
  getPermissionsThen(req, res, subject, 'delete', true, function(permissions, etag) {
    var query = 'DELETE FROM permissions WHERE subject = $1'
    pool.query(query, [subject], function (err, pg_res) {
      if (err) { 
        lib.badRequest(res, err);
      } else { 
        if (pg_res.rowCount === 0) {
          addCalculatedProperties(permissions, req); 
          lib.notFound(req, res);
        } else {
          lib.found(req, res, permissions, etag);
        }
      }
    });
  });
}

function updatePermissions(req, res, patch) {
  patch = lib.internalizeURLs(patch);
  var subject = url.parse(req.url).search.substring(1);
  getPermissionsThen(req, res, subject, 'update', true, function(permissions, etag) {
    if (req.headers['if-match'] == etag) { 
      lib.internalizeURLs(patch, req.headers.host);
      var patchedPermissions = lib.mergePatch(permissions, patch);

      calculateSharedWith(req, patchedPermissions);
      var query = 'UPDATE permissions SET data = ($1) WHERE subject = $2 AND etag = $3 RETURNING etag'
      var key = lib.internalizeURL(subject, req.headers.host)
      pool.query(query, [patchedPermissions, key, etag], function (err, pg_res) {
        if (err) { 
          lib.badRequest(res, err);
        } else {
          if (pg_res.rowCount === 0) { 
            lib.notFound(req, res);
          } else {
            var row = pg_res.rows[0];
            addCalculatedProperties(patchedPermissions, req); 
            lib.found(req, res, permissions, row.etag);
          }
        }
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

function withPermissionsDo(req, resource, actors, result, permissionsOfPermissions, action, recursion_set, callback) {
  var query = 'SELECT etag, data FROM permissions WHERE subject = $1'
  var key = lib.internalizeURL(resource, req.headers.host)
  recursion_set[key] = true;
  pool.query(query, [key], function (err, pg_res) {
    if (err) { 
      callback(err);
    } else { 
      if (pg_res.rowCount === 0) { 
        callback(404);
      } else {
        addAllowedActions(req, pg_res.rows[0].data, actors, result, permissionsOfPermissions, action, recursion_set, callback);
      }
    }
  });
}

function getAllowedActions(req, res, queryString) {
  var queryParts = querystring.parse(queryString);
  var allowedActions = {};
  var resource = lib.internalizeURL(queryParts.resource, req.headers.host);
  var user = null;
  if (queryParts.user !== undefined) {
    user = lib.internalizeURL(queryParts.user, req.headers.host);
  }
  perm.withTeamsDo(req, user, function(err, actors) {
    if (err) {
      lib.internalError(res, err);
    } else {
      withPermissionsDo(req, resource, actors, allowedActions, false, null, {}, function(statusCode) {
        if (statusCode == 200) {
          lib.found(req, res, Object.keys(allowedActions));
        } else if (statusCode == 404) {
          lib.notFound(req, res)
        } else {
          lib.internalError(statusCode)
        }
      });
    }
  });
}

function addUsersWhoCanSee(permissions, result, callback) {
  var sharedWith = permissions._sharedWith;
  if (sharedWith !== undefined) {
    for (var i=0; i < sharedWith.length; i++) {
      result[sharedWith[i]] = true;
    }
  }
  var inheritsPermissionsOf = permissions.governs.inheritsPermissionsOf;
  if (inheritsPermissionsOf !== undefined) {
    var count = 0;
    for (var j = 0; j < inheritsPermissionsOf.length; j++) {
      fetchUsersWhoCanSee(inheritsPermissionsOf[j], result, function() {if (++count == inheritsPermissionsOf.length) {callback();}});
    }
  } else {
    callback();
  }
}

function fetchUsersWhoCanSee(resource, result, callback) {
  pool.query('SELECT data FROM permissions WHERE subject = $1', [resource], function (err, pg_res) {
    if (err) {
      callback(err);
    } else {
      if (pg_res.rowCount === 0) {
        callback();
      } else {
        addUsersWhoCanSee(pg_res.rows[0].data, result, callback)
      }
    }
  });
}        

function getUsersWhoCanSee(req, res, resource) {
  var result = {};
  resource = lib.internalizeURL(resource, req.headers.host);
  getPermissionsThen(req, res, resource, "read", true, function (permissions, etag) {
    addUsersWhoCanSee(permissions, result, function() {
      lib.found(req, res, Object.keys(result));
    });
  });
}

function getResourcesSharedWith(req, res, user) {
  var requesting_user = lib.getUser(req);
  user = lib.internalizeURL(user, req.headers.host);
  if (user == requesting_user) {
    var query = "SELECT subject FROM permissions, jsonb_array_elements(permissions.data->'_sharedWith') AS sharedWith WHERE sharedWith <@ '";
    var params;
    if (user !== null) {
      params = [user, ANYONE, INCOGNITO]
    } else {
      params = [INCOGNITO]
    }
    query += JSON.stringify(params);
    query += "'";
    pool.query(query, function (err, pg_res) {
      if (err) {
        lib.badRequest(res, err);
      }
      else {
        var result = [];
        var rows = pg_res.rows;
        for (var i = 0; i < rows.length; i++) {result.push(rows[i].subject);}
        lib.found(req, res, result);
      }
    });
  } else {
    lib.forbidden(req, res)
  }
}

function getPermissionsHeirs(req, res, securedObject) {
  securedObject = lib.internalizeURL(securedObject, req.headers.host);
  getPermissionsThen(req, res, securedObject, 'read', false, function() {
    pool.query( 'SELECT subject, data FROM permissions WHERE data @> \'{"governs": {"inheritsPermissionsOf":["' + securedObject + '"]}}\'', function (err, pg_res) {
      if (err) {
        lib.badRequest(res, err);
      }
      else {
        var result = [];
        var rows = pg_res.rows;
        for (var i = 0; i < rows.length; i++) {
            lib.externalizeURLs(rows[i].data.governs, req.host); 
            result.push(rows[i].data.governs);
        }
        lib.found(req, res, result);
      }
    });
  });
}

function requestHandler(req, res) {
  if (req.url == '/permissions') {
    if (req.method == 'POST') {
      lib.getServerPostBody(req, res, createPermissions);
    } else { 
      lib.methodNotAllowed(req, res);
    }
  } else {
    var req_url = url.parse(req.url);
    if (req_url.pathname == '/permissions' && req_url.search !== null) {
      if (req.method == 'GET') { 
        getPermissions(req, res, lib.internalizeURL(req_url.search.substring(1)));
      } else if (req.method == 'DELETE') { 
        deletePermissions(req, res, lib.internalizeURL(req_url.search.substring(1)));
      } else if (req.method == 'PATCH') { 
        lib.getServerPostBody(req, res, updatePermissions);
      } else {
        lib.methodNotAllowed(req, res);
      }
    } else if (req_url.pathname == '/allowed-actions' && req_url.search !== null){ 
      if (req.method == 'GET') {
        getAllowedActions(req, res, lib.internalizeURL(req_url.search.substring(1)));
      } else {
        lib.methodNotAllowed(req, res);
      }
    } else if (req_url.pathname == '/resources-shared-with' && req_url.search !== null) {
      if (req.method == 'GET') {
        getResourcesSharedWith(req, res, lib.internalizeURL(req_url.search.substring(1)));
      } else {
        lib.methodNotAllowed(req, res);
      }
    } else  if (req_url.pathname == '/permissions-heirs' && req_url.search !== null) {
      if (req.method == 'GET') {
        getPermissionsHeirs(req, res, lib.internalizeURL(req_url.search.substring(1)));
      } else {
        lib.methodNotAllowed(req, res);
      }
    } else if (req_url.pathname == '/users-who-can-access' && req_url.search !== null) {
      if (req.method == 'GET') {
        getUsersWhoCanSee(req, res, lib.internalizeURL(req_url.search.substring(1)));
      } else {
        lib.methodNotAllowed(req, res);
      }
    } else {
      lib.notFound(req, res);
    }
  }
}

pool.query('CREATE TABLE IF NOT EXISTS permissions (subject text primary key, etag serial, data jsonb);', function(err, pg_res) {
  if(err) {
    console.error('error creating permissions table', err);
  } else {
    http.createServer(requestHandler).listen(3001, function() {
      console.log('server is listening on 3001');
    });
  }
});