'use strict';
var http = require('http');
var Pool = require('pg').Pool;
var url = require('url');
var querystring = require('querystring');
var httpPatterns = require('./http-patterns.js')
var getPostBody = httpPatterns.getPostBody;
var methodNotAllowed = httpPatterns.methodNotAllowed;
var notFound = httpPatterns.notFound;
var badRequest = httpPatterns.badRequest;
var found = httpPatterns.found;
var created = httpPatterns.created;
var respond = httpPatterns.respond;
var internalizeURL = httpPatterns.internalizeURL;
var internalizeURLs = httpPatterns.internalizeURLs;
var externalizeURLs = httpPatterns.externalizeURLs;

var PROTOCOL = 'http';
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

// Begin functions specific to the 'business logic' of the permissions application

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
  for (var i = 0; i < OPERATIONPROPERTIES.length; i++)
    if (permissions.hasOwnProperty(OPERATIONPROPERTIES[i])) {
      var users = permissions[OPERATIONPROPERTIES[i]];
      for (var j = 0; j < users.length; j++) result[users[j]] = true;
    }
  permissions['_sharedWith'] = Object.keys(result)
}

function createPermissions(req, res, permissions) {
  var err = verifyPermissions(permissions)
  if (err == null) {
    calculateSharedWith(permissions);
    internalizeURLs(permissions, req.headers.host)
    pool.query('INSERT INTO permissions (subject, data) values($1, $2) RETURNING etag', [permissions.governs, permissions], function (err, pg_res) {
      if (err) {
        var body = JSON.stringify(err)
        res.writeHead(400, {'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(body)});
        res.write(body);
        res.end()
      } else {
        var selfURL = PROTOCOL + '://' + req.headers.host + '/permissions?' + permissions.governs;
        var etag = pg_res.rows[0].etag
        permissions['_self'] = selfURL;
        created(req, res, permissions, selfURL, etag)
      }
    })
  } else badRequest(res, err)
}

function getPermissions(req, res, subject) {
  pool.query('SELECT etag, data FROM permissions WHERE subject = $1', [subject], function (err, pg_res) {
    if (err) badRequest(res, err)
    else {
      if (pg_res.rowCount == 0) notFound(req, res);
      else {
        var row = pg_res.rows[0];
        externalizeURLs(row.data, req.headers.host, PROTOCOL)
        row.data['_self'] = selfURL;
        found(req, res, row.data, row.etag)
      }
    }
  })
}

function addAllowedActions(resource, user, result, callback) {
  pool.query('SELECT etag, data FROM permissions WHERE subject = $1', [resource], function (err, pg_res) {
    if (err) callback(err)
    else 
      if (pg_res.rowCount == 0) callback();
      else {
        var row = pg_res.rows[0];
        for (var i = 0; i < OPERATIONPROPERTIES.length; i++)
          if (row.data.hasOwnProperty(OPERATIONPROPERTIES[i])) 
            if (row.data[OPERATIONPROPERTIES[i]].indexOf(user) > -1) 
              result[OPERATIONS[i]] = true;
        if (row.data.hasOwnProperty('sharingSets')) {
          var sharingSets = row.data.sharingSets;
          var count = 0
          for (var i = 0; i < sharingSets.length; i++) {
            addAllowedActions(sharingSets[i], user, result, function() {if (++count == sharingSets.length) callback()})
          }
        } else callback()
      }
  })
}        

function getAllowedActions(req, res, queryString) {
  var queryParts = querystring.parse(queryString)
  if (queryParts.user && queryParts.resource) {
    var result = {};
    var resource = internalizeURL(queryParts.resource, req.headers.host);
    var user = internalizeURL(queryParts.user, req.headers.host);
    addAllowedActions(resource, user, result, function() {
      found(req, res, Object.keys(result))
    })
  } else badRequest(res, 'must provide both resource and user URLs in querystring: ' + queryString)  
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
  var resource = internalizeURL(resource, req.headers.host);
  addUsersWhoCanSee(resource, result, function() {
    found(req, res, Object.keys(result))
  })
}

function getResourcesSharedWith(req, res, user) {
  var user = internalizeURL(user, req.headers.host);
  pool.query( 'SELECT subject FROM permissions WHERE data @> \'{"_sharedWith":["' + user + '"]}\'', function (err, pg_res) {
    if (err) badRequest(res, err)
    else {
      var result = [];
      var rows = pg_res.rows
      for (var i = 0; i < rows.length; i++) result.push(rows[i]. subject)
    }
    found(req, res, result)
  })
}

// End functions specific to the 'business logic' of the permissions application

//  HTTP request routing specific to prmissions application

function requestHandler(req, res) {
  if (req.url == '/permissions')
    if (req.method == 'POST') getPostBody(req, res, createPermissions);
    else methodNotAllowed(req, res);
  else {
    var req_url = url.parse(req.url);
    if (req_url.pathname == '/permissions' && req_url.search != null) 
      if (req.method == 'GET') getPermissions(req, res, req_url.search.substring(1))
      else methodNotAllowed(req, res)
    else if (req_url.pathname == '/allowed-actions' && req_url.search != null) 
      if (req.method == 'GET') getAllowedActions(req, res, req_url.search.substring(1))
      else methodNotAllowed(req, res)
    else if (req_url.pathname == '/resources-shared-with' && req_url.search != null)
      if (req.method == 'GET') getResourcesSharedWith(req, res, req_url.search.substring(1))
      else methodNotAllowed(req, res)
    else if (req_url.pathname == '/users-who-can-see' && req_url.search != null)
      if (req.method == 'GET') getUsersWhoCanSee(req, res, req_url.search.substring(1))
      else methodNotAllowed(req, res)
    else notFound(req, res)
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