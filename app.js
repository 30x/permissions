'use strict';
var http = require('http');
var Pool = require('pg').Pool;
var url = require('url');
var querystring = require('querystring');
var lib = require('./standard-functions.js');

var PROTOCOL = process.env.PROTOCOL || 'http';
var ANYONE = 'http://apigee.com/users/anyone';
var INCOGNITO = 'http://apigee.com/users/incognito';

var config = {
  host: 'localhost',
  user: 'martinnally',
  password: 'martinnally',
  database: 'permissions'
};

var pool = new Pool(config);

function verifyPermissions(permissions, req) {
  if (permissions.isA == 'Permissions') {
    if (permissions.hasOwnProperty('sharingSets')) {
      return 'sharingSets for a Permissions resource independent of sharingSets for the resource it governs not supported'
    } else {
      if (permissions.governs !== undefined) {
        var governed = permissions.governs;
        if (governed._self !== undefined) {
          if (governed.sharingSet !== undefined && !Array.isArray(governed.sharingSet)) {
            return 'sharingSet must be an Array'
          } else {
            var user = lib.getUser(req);
            if (permissions.updaters === undefined && governed.sharingSets === undefined) {
              permissions.updaters = [user];
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

function calculateSharedWith(permissions) {
  var result = {};
  function listUsers (obj) {
    for (var i = 0; i < OPERATIONPROPERTIES.length; i++) {
      var users = obj[OPERATIONPROPERTIES[i]];
      if (users !== undefined) {
        for (var j = 0; j < users.length; j++) {result[users[j]] = true;}
      }
    }
  }
  listUsers(permissions);
  listUsers(permissions.governs);
  permissions._sharedWith = Object.keys(result);
}

function createPermissions(req, res, permissions) {
  var user = lib.getUser(req);
  if (user == null) {
    lib.unauthorized(req, res)
  } else {
    var err = verifyPermissions(permissions, req);
    if (err === null) {
      err = lib.setStandardCreationProperties(permissions, req, user);
    }
    if (err === null) {
      calculateSharedWith(permissions);
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
          var selfURL = PROTOCOL + '://' + req.headers.host + '/permissions?' + permissions.governs._self;
          permissions['_self'] = selfURL;
          lib.created(req, res, permissions, selfURL, etag);
        }
      });
    } else {
      lib.badRequest(res, err);
    }
  }
}

function addCalculatedProperties(permissions, req) {
  permissions._self = PROTOCOL + '://' + req.headers.host + '/permissions?' + permissions.governs;
}

function getPermissionsThen(req, res, subject, action, callback) {
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
        if (user !== null) {
          var allowedActions = {};
          addAllowedActions(req, row.data, user, allowedActions, true, function() {
            if (action in allowedActions) {
              lib.externalizeURLs(row.data, req.headers.host, PROTOCOL);
              addCalculatedProperties(row.data, req); 
              callback(row.data, row.etag);
            } else { 
              lib.forbidden(req, res);
            }
          });
        } else { 
          lib.unauthorized(req, res);
        }
      }
    }
  });
}

function getPermissions(req, res, subject) {
  getPermissionsThen(req, res, subject, 'read', function(permissions, etag) {
    lib.found(req, res, permissions, etag);
  });
}

function deletePermissions(req, res, subject) {
  getPermissionsThen(req, res, subject, 'delete', function(permissions, etag) {
    var query = 'DELETE FROM permissions WHERE subject = $1'
    var key = lib.internalizeURL(subject, req.headers.host)
    pool.query(query, [key], function (err, pg_res) {
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

function mergePatch(target, patch) {
  if (typeof patch == 'object') {
    if (typeof target != 'object') {
      target = {}; // don't just return patch since it may have nulls; perform the merge
    }
    for (var name in patch) {
      if (patch.hasOwnProperty(name)) {
        var value = patch[name];
        if (value === null) {
          if (name in target) {
            delete target[name];
          }
        } else {
           target[name] = mergePatch(target[name], value);
        }
      }
    }
    return target;
  } else {
    return patch;
  }
}

function updatePermissions(req, res, patch) {
  var subject = url.parse(req.url).search.substring(1);
  getPermissionsThen(req, res, subject, 'update', function(permissions, etag) {
    var patchedPermissions = mergePatch(permissions, patch);
    lib.internalizeURLs(patchedPermissions, req.headers.host);
    var query = 'UPDATE permissions SET data = ($1) WHERE subject = $2 RETURNING etag'
    var key = lib.internalizeURL(subject, req.headers.host)
    pool.query(query, [patchedPermissions, key], function (err, pg_res) {
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
  });
}

function addAllowedActions(req, data, user, result, permissionsOfPermissions, callback) {
  var permissions;
  if (permissionsOfPermissions) { 
    permissions = data;
  } else {
    permissions = data.governs;
  }
  for (var i = 0; i < OPERATIONPROPERTIES.length; i++) {
    if (permissions.hasOwnProperty(OPERATIONPROPERTIES[i])){
      if ((user === null && permissions[OPERATIONPROPERTIES[i]].indexOf(INCOGNITO) > -1) || (permissions[OPERATIONPROPERTIES[i]].indexOf(user) > -1 || permissions[OPERATIONPROPERTIES[i]].indexOf(ANYONE) > -1)) { 
        result[OPERATIONS[i]] = true;
      }
    }
  }
  var sharingSets = data.governs.sharingSets;
  if (sharingSets !== undefined && sharingSets.length > 0) {
    var count = 0;
    for (var j = 0; j < sharingSets.length; j++) {
      readAllowedActions(req, sharingSets[j], user, result, permissionsOfPermissions, function() {
        if (++count == sharingSets.length) {
          callback(200);
        }
      });
    }
  } else {
    callback(200);
  }
}

function readAllowedActions(req, resource, user, result, permissionsOfPermissions, callback) {
  var query = 'SELECT etag, data FROM permissions WHERE subject = $1'
  var key = lib.internalizeURL(resource, req.headers.host)
  pool.query(query, [key], function (err, pg_res) {
    if (err) { 
      callback(err);
    } else { 
      if (pg_res.rowCount === 0) { 
        callback(404);
      } else {
        addAllowedActions(req, pg_res.rows[0].data, user, result, permissionsOfPermissions, callback);
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
  readAllowedActions(req, resource, user, allowedActions, false, function(statusCode) {
    if (statusCode == 200) {
      lib.found(req, res, Object.keys(allowedActions));
    } else if (statusCode == 404) {
      lib.notFound(req, res)
    } else {
      lib.internalError(statusCode)
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
  var sharingSets = permissions.governs.sharingSets;
  if (sharingSets !== undefined) {
    var count = 0;
    for (var j = 0; j < sharingSets.length; j++) {
      fetchUsersWhoCanSee(sharingSets[j], result, function() {if (++count == sharingSets.length) {callback();}});
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
  getPermissionsThen(req, res, resource, "read", function (permissions, etag) {
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

function getResourcesInSharingSet(req, res, sharingSet) {
  var user = lib.internalizeURL(sharingSet, req.headers.host);
  pool.query( 'SELECT subject, data FROM permissions WHERE data @> \'{"governs": {"sharingSets":["' + sharingSet + '"]}}\'', function (err, pg_res) {
    if (err) {
      lib.badRequest(res, err);
    }
    else {
      var result = [];
      var rows = pg_res.rows;
      for (var i = 0; i < rows.length; i++) {
        console.log(rows[i]);
        lib.externalizeURLs(rows[i].data.governs, req.host); 
        result.push(rows[i].data.governs);
      }
      lib.found(req, res, result);
    }
  });
}

function requestHandler(req, res) {
  if (req.url == '/permissions') {
    if (req.method == 'POST') {
      lib.getPostBody(req, res, createPermissions);
    } else { 
      lib.methodNotAllowed(req, res);
    }
  } else {
    var req_url = url.parse(req.url);
    if (req_url.pathname == '/permissions' && req_url.search !== null) {
      if (req.method == 'GET') { 
        getPermissions(req, res, req_url.search.substring(1));
      } else if (req.method == 'DELETE') { 
        deletePermissions(req, res, req_url.search.substring(1));
      } else if (req.method == 'PATCH') { 
        lib.getPostBody(req, res, updatePermissions);
      } else {
        lib.methodNotAllowed(req, res);
      }
    } else if (req_url.pathname == '/allowed-actions' && req_url.search !== null){ 
      if (req.method == 'GET') {
        getAllowedActions(req, res, req_url.search.substring(1));
      } else {
        lib.methodNotAllowed(req, res);
      }
    } else if (req_url.pathname == '/resources-shared-with' && req_url.search !== null) {
      if (req.method == 'GET') {
        getResourcesSharedWith(req, res, req_url.search.substring(1));
      } else {
        lib.methodNotAllowed(req, res);
      }
    } else  if (req_url.pathname == '/resources-in-sharing-set' && req_url.search !== null) {
      if (req.method == 'GET') {
        getResourcesInSharingSet(req, res, req_url.search.substring(1));
      } else {
        lib.methodNotAllowed(req, res);
      }
    } else if (req_url.pathname == '/users-who-can-see' && req_url.search !== null) {
      if (req.method == 'GET') {
        getUsersWhoCanSee(req, res, req_url.search.substring(1));
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