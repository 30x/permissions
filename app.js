'use strict';
var http = require('http');
var Pool = require('pg').Pool;
var url = require('url')

var protocol = 'http';
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
    internalize_urls(permissions, req.headers.host)
    pool.query('INSERT INTO permissions (subject, data) values($1, $2)', [permissions.governs, permissions], function (err, pg_res) {
      if (err) {
        res.writeHead(400, {'content-type': 'text/plain'});
        res.write(JSON.stringify(err));
        res.end()
      } else {
        res.writeHead(201, {'Location': '/permissions?' + permissions.governs, 'content-type': 'text/plain'});
        res.end()
      }
    })
  } else badRequest(res, err)
}

function getPermissions(req, res, subject) {
  pool.query('SELECT etag, data FROM permissions WHERE subject = $1', [subject], function (err, pg_res) {
    if (err) badRequest(res, err)
    else {
      if (pg_res.rowCount == 0) notFound(res, req);
      else {
        var row = pg_res.rows[0];
        res.writeHead(200, {'Location': '/permissions?' + subject, 'content-type': 'application/json', 'etag': row.etag});
        internalize_urls(row.data, req.headers.host, protocol)
        res.write(JSON.stringify(row.data));
        res.end()
      }
    }
  })
}

// End functions specific to the 'business logic' of the permissions application
//==============================================================================

// Begin generic http functions that could be moved to a library

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

function methodNotAllowed(res, req) {
  res.writeHead(405, {'content-type': 'text/plain'});
  res.write('Method not allowed. request-target: ' + req.url + ' method: ' + req.method + '\n');
  res.end();
}

function notFound(res, req) {
  res.writeHead(404, {'content-type': 'text/plain'});
  res.write('Not Found. request-target: ' + req.url + ' method: ' + req.method + '\n');
  res.end();
}

function badRequest(res, err) {
  res.writeHead(400, {'content-type': 'text/plain'});
  res.write(err);
  res.end()
}   

function internalize_urls(jsObject, authority) {
  //strip the http://authority or https://authority from the front of any urls
  if (typeof jsObject == 'object') {
    var httpString = 'http://' + authority
    var httpsString = 'https://' + authority
    for(var key in jsObject) {
      if (jsObject.hasOwnProperty(key)) {
        var val = jsObject[key]
        if (typeof val == 'string') {
          if (val.lastIndexOf(httpString) === 0) jsObject[key] = val.substring(httpString.length);
          else if (val.lastIndexOf(httpsString) === 0) jsObject[key] = val.substring(httpsString.length);
        } else if (Array.isArray(val)) {
          for (var i = 0; i < val.length; i++) {
            var vali = val[i]
            if (typeof vali == 'string') {
              if (vali.lastIndexOf(httpString) === 0) val[i] = vali.substring(httpString.length);
              else if (vali.lastIndexOf(httpsString) === 0) val[i] = vali.substring(httpsString.length);
            } else internalize_urls(vali, authority)             
          }
        } else internalize_urls(val, authority)
      }
    }
  }
}  

function externalize_urls(jsObject, authority, protocol) {
  //add http://authority or https://authority to the front of any urls
  if (typeof jsObject == 'object') {
    protocol = protocol || 'http';
    var prefix = protocol + '://' + authority;
    for(var key in jsObject) {
      if (jsObject.hasOwnProperty(key)) {
        var val = jsObject[key];
        if (typeof val == 'string') {
          if (val.lastIndexOf('/') === 0) jsObject[key] = prefix + val;
        } else if (Array.isArray(val)) {
          for (var i = 0; i < val.length; i++) {
            var vali = val[i]
            if (typeof vali == 'string') 
              if (vali.lastIndexOf('/') === 0) val[i] = prefix + val;
            else internalize_urls(vali, authority)             
          }
        } else internalize_urls(val, authority)
      }
    }
  }
}  

// End generic http functions that could be moved to a library

// Function specific to permissions HTTP resources
function requestHandler(req, res) {
  if (req.url == '/permissions') {
    if (req.method == 'POST') getPostBody(req, res, createPermissions);
    else methodNotAllowed(res, req);
  } else {
    var req_url = url.parse(req.url);
    if (req_url.pathname == '/permissions' && req_url.search != null) {
      if (req.method == 'GET') getPermissions(req, res, req_url.search.substring(1))
      else methodNotAllowed(res, req)
    } else if (req_url.pathname == '/allowed-actions' && req_url.search != null) {

    } else notFound(res, req)
  }
};

pool.query('CREATE TABLE IF NOT EXISTS permissions (subject text primary key, etag serial, data jsonb);', function(err, pg_res) {
  if(err) return console.error('error creating permissions table', err);
  else {
    http.createServer(requestHandler).listen(3001, function() {
      console.log('server is listening on 3001')
    })
  }
})