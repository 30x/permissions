'use strict';
var http = require('http');
var Pool = require('pg').Pool;
var url = require('url')

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
  if (permissions.hasOwnProperty('kind') && permissions.kind == 'Permissions') {
    if (permissions.hasOwnProperty('governs')) {
      return null
    } else {
      // no governs property
      return 'invalid JSON: "governs" property not set'
    }
  } else {
    // not a Permissions body
    return 'invalid JSON: "kind" property not set to "Permissions"'
  }
}

function createPermissions(req, res, permissions) {
  var err = verifyPermissions(permissions)
  if (err == null) {
    pool.query('INSERT INTO permissions (subject, data) values($1, $2)', [permissions.governs, permissions], function (err, pg_res) {
      if (err) {
        res.writeHead(400, {'content-type': 'text/plain'})
        res.write(JSON.stringify(err))
        res.end()
      } else {
        res.writeHead(201, {'Location': '/permissions?' + permissions.governs, 'content-type': 'text/plain'})
        res.end()
      }
    })
  } else {
    res.writeHead(400, {'content-type': 'text/plain'});
    res.write(err);
    res.end();          
  }
}

function getPostBody(req, res, callback) {
  var body = '';

  req.on('data', function (data) {
    if (body.length + data.length > 1e6)
      req.connection.destroy();
    body += data;
  });
  req.on('end', function () {
    var jso;
    try {
      jso = JSON.parse(body);
    }
    catch (err) {
      res.writeHead(400, {'content-type': 'text/plain'});
      res.write('invalid JSON: ' + err.message);
      res.end();          
    }
    if (jso) callback(req, res, jso);
  });
}

function methodNotAllowed(res) {
  res.writeHead(405, {'content-type': 'text/plain'});
  res.write('Method not allowed. request-target: ' + req.url + ' method: ' + req.method + '\n');
  res.end();
}

function notFound(res) {
  res.writeHead(404, {'content-type': 'text/plain'});
  res.write('Not Found. request-target: ' + req.url + ' method: ' + req.method + '\n');
  res.end();
}

var server = http.createServer(function(req, res) {

  if (req.url == '/permissions') {
    if (req.method == 'POST') {
      getPostBody(req, res, createPermissions)
    } else methodNotAllowed(res)
  } else {
    var req_url = url.parse(req.url);
    if (req_url.pathname == '/permissions' && req_url.search != null) {
      if (req.method == 'GET') {
        res.writeHead(200, {'content-type': 'text/plain'});
        res.write('GET '+ req_url.search.substring(1) + '\n' );
        res.end();
      } else methodNotAllowed(res)
    } else notFound(res)
  }
});

pool
  .query('CREATE TABLE IF NOT EXISTS permissions (subject text primary key, etag serial, data jsonb);')
  .then(function() {
    server.listen(3001, function() {
      console.log('server is listening on 3001')
    })
  })