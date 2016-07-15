'use strict';
var http = require('http');
var Pool = require('pg').Pool;
var url = require('url');
var querystring = require('querystring');
var lib = require('./standard-functions.js')

var PROTOCOL = process.env.PROTOCOL || 'http';

var config = {
  host: 'localhost',
  user: 'martinnally',
  password: 'martinnally',
  database: 'permissions',
};

process.on('unhandledRejection', function(e) {
  console.log(e.message, e.stack)
})

var pool = new Pool(config)

function verifyPermissions(permissions) {
  if (permissions.hasOwnProperty('kind') && permissions.kind == 'Permissions')
    if (permissions.hasOwnProperty('governs')) return null
    else return 'invalid JSON: "governs" property not set'
  else return 'invalid JSON: "kind" property not set to "Permissions"'
}

var OPERATIONPROPERTIES = ['creators', 'readers', 'updaters', 'deleters'];
var OPERATIONS = ['create', 'read', 'update', 'deleters'];

function calculateSharedWith(permissions) {
  var result = {}
  function listUsers (obj) {
    for (var i = 0; i < OPERATIONPROPERTIES.length; i++)
      if (permissions.hasOwnProperty(OPERATIONPROPERTIES[i])) {
        var users = permissions[OPERATIONPROPERTIES[i]];
        for (var j = 0; j < users.length; j++) result[users[j]] = true;
      }
  }
  listUsers(permissions);
  if ('governedBy' in permissions)
    listUsers(permissions.governedBy)
  permissions._sharedWith = Object.keys(result)
}

function createPermissions(req, res, permissions) {
  var err = verifyPermissions(permissions)
  if (err == null) {
    calculateSharedWith(permissions);
    if ('governedBy' in permissions)
      permissions.governedBy.governs = '/permissions?' + permissions.governs; 
    lib.internalizeURLs(permissions, req.headers.host)
    pool.query('INSERT INTO permissions (subject, data) values($1, $2) RETURNING etag', [permissions.governs, permissions], function (err, pg_res) {
      if (err) {
        var body = JSON.stringify(err)
        res.writeHead(400, {'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(body)});
        res.write(body);
        res.end()
      } else {
        var etag = pg_res.rows[0].etag
        var selfURL = PROTOCOL + '://' + req.headers.host + '/permissions?' + permissions.governs;
        permissions['_self'] = selfURL;
        if ('governedBy' in permissions)
          permissions.governedBy._self = PROTOCOL + '://' + req.headers.host + '/permissions?' + permissions.governs + '#permissionsOfPermissions'; 
        lib.created(req, res, permissions, selfURL, etag)
      }
    })
  } else lib.badRequest(res, err)
}

function getPermissions(req, res, subject) {
  pool.query('SELECT etag, data FROM permissions WHERE subject = $1', [subject], function (err, pg_res) {
    if (err) lib.badRequest(res, err)
    else {
      if (pg_res.rowCount == 0) lib.notFound(req, res);
      else {
        var row = pg_res.rows[0];
        var user = lib.getUser(req);
        if (user != null) {
          var allowedActions = {};
          addAllowedActions(row.data, user, allowedActions, true, function() {
            if ("read" in allowedActions) {
              lib.externalizeURLs(row.data, req.headers.host, PROTOCOL)
              row.data._self = PROTOCOL + '://' + req.headers.host + '/permissions?' + subject;
              if ('governedBy' in row.data)
                row.data.governedBy._self = PROTOCOL + '://' + req.headers.host + '/permissions?' + subject + '#permissionsOfPermissions';
              lib.found(req, res, row.data, row.etag)
            } else 
              lib.forbidden(req, res)
          })
        } else 
          lib.unauthorized(req, res)
      }
    }
  })
}

function addAllowedActions(data, user, result, permissionsOfPermissions, callback) {
  var permissions;
  if (permissionsOfPermissions) permissions = data.governedBy;
  else permissions = data;
  if (permissions != null)
    for (var i = 0; i < OPERATIONPROPERTIES.length; i++)
      if (permissions.hasOwnProperty(OPERATIONPROPERTIES[i])) 
        if (permissions[OPERATIONPROPERTIES[i]].indexOf(user) > -1) 
          result[OPERATIONS[i]] = true;
  var sharingSets = data.sharingSets;
  if (sharingSets != null && sharingSets.length > 0) {
    var count = 0
    for (var i = 0; i < sharingSets.length; i++) {
      readAllowedActions(sharingSets[i], user, result, permissionsOfPermissions, function() {if (++count == sharingSets.length) callback()})
    }
  } else callback()
}

function readAllowedActions(resource, user, result, permissionsOfPermissions, callback) {
  pool.query('SELECT etag, data FROM permissions WHERE subject = $1', [resource], function (err, pg_res) {
    if (err) callback(err)
    else 
      if (pg_res.rowCount == 0) callback();
      else addAllowedActions(pg_res.rows[0].data, user, result, permissionsOfPermissions, callback)
  })
}        

function getAllowedActions(req, res, queryString) {
  var queryParts = querystring.parse(queryString)
  if (queryParts.user && queryParts.resource) {
    var allowedActions = {};
    var resource = lib.internalizeURL(queryParts.resource, req.headers.host);
    var user = lib.internalizeURL(queryParts.user, req.headers.host);
    readAllowedActions(resource, user, allowedActions, false, function() {
      lib.found(req, res, Object.keys(allowedActions))
    })
  } else lib.badRequest(res, 'must provide both resource and user URLs in querystring: ' + queryString)  
}

function addUsersWhoCanSee(resource, result, callback) {
  pool.query('SELECT data FROM permissions WHERE subject = $1', [resource], function (err, pg_res) {
    if (err) callback(err)
    else 
      if (pg_res.rowCount == 0) callback();
      else {
        var row = pg_res.rows[0];
        if (row.data.hasOwnProperty('_sharedWith')) {
          var sharedWith = row.data._sharedWith;
          for (var i=0; i < sharedWith.length; i++) 
            result[sharedWith[i]] = true;
        }
        if (row.data.hasOwnProperty('sharingSets')) {
          var sharingSets = row.data.sharingSets;
          var count = 0
          for (var j = 0; j < sharingSets.length; j++) {
            addUsersWhoCanSee(sharingSets[j], result, function() {if (++count == sharingSets.length) callback()})
          }
        } else callback()
      }
  })
}        

function getUsersWhoCanSee(req, res, resource) {
  var result = {};
  var resource = lib.internalizeURL(resource, req.headers.host);
  addUsersWhoCanSee(resource, result, function() {
    lib.found(req, res, Object.keys(result))
  })
}

function getResourcesSharedWith(req, res, user) {
  var user = lib.internalizeURL(user, req.headers.host);
  pool.query( 'SELECT subject FROM permissions WHERE data @> \'{"_sharedWith":["' + user + '"]}\'', function (err, pg_res) {
    if (err) lib.badRequest(res, err)
    else {
      var result = [];
      var rows = pg_res.rows
      for (var i = 0; i < rows.length; i++) result.push(rows[i].subject)
      lib.found(req, res, result)
    }
  })
}

function getResourcesInSharingSet(req, res, sharingSet) {
  var user = lib.internalizeURL(sharingSet, req.headers.host);
  pool.query( 'SELECT subject FROM permissions WHERE data @> \'{"sharingSets":["' + sharingSet + '"]}\'', function (err, pg_res) {
    if (err) lib.badRequest(res, err)
    else {
      var result = [];
      var rows = pg_res.rows
      for (var i = 0; i < rows.length; i++) result.push(rows[i].subject)
      lib.found(req, res, result)
    }
  })
}

function requestHandler(req, res) {
  if (req.url == '/permissions')
    if (req.method == 'POST') lib.getPostBody(req, res, createPermissions);
    else lib.methodNotAllowed(req, res);
  else {
    var req_url = url.parse(req.url);
    if (req_url.pathname == '/permissions' && req_url.search != null) 
      if (req.method == 'GET') getPermissions(req, res, req_url.search.substring(1))
      else lib.methodNotAllowed(req, res)
    else if (req_url.pathname == '/allowed-actions' && req_url.search != null) 
      if (req.method == 'GET') getAllowedActions(req, res, req_url.search.substring(1))
      else lib.methodNotAllowed(req, res)
    else if (req_url.pathname == '/resources-shared-with' && req_url.search != null)
      if (req.method == 'GET') getResourcesSharedWith(req, res, req_url.search.substring(1))
      else lib.methodNotAllowed(req, res)
    else if (req_url.pathname == '/resources-in-sharing-set' && req_url.search != null)
      if (req.method == 'GET') getResourcesInSharingSet(req, res, req_url.search.substring(1))
      else lib.methodNotAllowed(req, res)
    else if (req_url.pathname == '/users-who-can-see' && req_url.search != null)
      if (req.method == 'GET') getUsersWhoCanSee(req, res, req_url.search.substring(1))
      else lib.methodNotAllowed(req, res)
    else lib.notFound(req, res)
  }
}

pool.query('CREATE TABLE IF NOT EXISTS permissions (subject text primary key, etag serial, data jsonb);', function(err, pg_res) {
  if(err) console.error('error creating permissions table', err);
  else {
    http.createServer(requestHandler).listen(3001, function() {
      console.log('server is listening on 3001')
    })
  }
})