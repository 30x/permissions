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

function createPermission(req, res, permissions) {
  if (permissions.hasOwnProperty('kind') && permissions.kind == 'Permissions') {
    if (permissions.hasOwnProperty('governs')) {
      pool.query('INSERT INTO permissions (subject, data) values($1, $2)', [permissions.governs, permissions], function (err, pg_res) {
        if (err) {
          res.writeHead(400, {'content-type': 'text/plain'})
          res.write(JSON.stringify(err))
          res.end()
        } else {
          res.writeHead(201, {'Location': '/permissions?resource=%s' % permissions.governs, 'content-type': 'text/plain'})
          res.write(JSON.stringify(err))
          res.end()
        }
      })
    } else {
      // no governs property
      res.writeHead(400, {'content-type': 'text/plain'});
      res.write('invalid JSON: "governs" property not set');
      res.end();          
    }
  } else {
    // not a Permissions body
    res.writeHead(400, {'content-type': 'text/plain'});
    res.write('invalid JSON: "kind" property not set to "Permissions"');
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

var server = http.createServer(function(req, res) {

  if (req.url == '/permissions') {
    if (req.method == 'POST') {
      getPostBody(req, res, createPermission)
    } else {
      res.writeHead(405, {'content-type': 'text/plain'});
      res.write('Method not allowed. request-target: ' + req.url + ' method: ' + req.method + '\n');
      res.end();
    }
  } else {
    res.writeHead(404, {'content-type': 'text/plain'});
    res.write('Not Found. request-target: ' + req.url + ' method: ' + req.method + '\n');
    res.end();
  }
});

pool
  .query('CREATE TABLE IF NOT EXISTS permissions (subject text primary key, etag serial, data jsonb);')
  .then(function() {
    server.listen(3001, function() {
      console.log('server is listening on 3001')
    })
  })