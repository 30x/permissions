'use strict';
var http = require('http');
var Pool = require('pg').Pool;
var url = require('url')
var querystring = require('querystring')

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
  if (permissions.hasOwnProperty('kind') && permissions.kind == 'Permissions') {
    if (permissions.hasOwnProperty('governs')) {
      return null
    } else {
      // no governs property
      return 'invalid JSON: "governs" property not set'
    }
  } else {
    // not a Permissions entity
    return 'invalid JSON: "kind" property not set to "Permissions"'
  }
}

var OPERATIONS = ['creators', 'readers', 'updaters', 'deleters'];

function calculateSharedWith(permissions) {
  var result = {}
  for (var i = 0; i < OPERATIONS.length; i++)
    if (permissions.hasOwnProperty(OPERATIONS[i])) {
      var users = permissions[OPERATIONS[i]];
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
        externalizeURLs(row.data, req.headers.host, protocol)
        var selfURL = protocol + '://' + req.headers.host + '/permissions?' + subject;
        row.data['_self'] = selfURL;
        found(req, res, row.data, selfURL, row.etag)
      }
    }
  })
}

function addAllowedActions(resource, user, result, callback) {
  pool.query('SELECT etag, data FROM permissions WHERE subject = $1', [resource], function (err, pg_res) {
    if (err) return err
    else 
      if (pg_res.rowCount == 0) return 404;
      else {
        var row = pg_res.rows[0];
        for (var i = 0; i < OPERATIONS.length; i++)
          if (row.data.hasOwnProperty(OPERATIONS[i])) 
            if (row.data[OPERATIONS[i]].indexOf(user) > -1) 
              result[OPERATIONS[i]] = true;
        callback()
      }
  })
}        

function getAllowedActions(req, res, queryString) {
  var queryParts = querystring.parse(queryString)
  if (queryParts.user && queryParts.resource) {
    var result = {};
    var resource = internalizeURL(queryParts.resource, req.headers.host);
    var user = internalizeURL(queryParts.user, req.headers.host);
    var err = addAllowedActions(resource, user, result, function() {
      var selfURL = PROTOCOL + '://' + req.headers.host + '/allowed-actions?' + queryString
      found(req, res, Object.keys(result), selfURL)
    })
  } else badRequest(res, 'must provide both resource and user URLs in querystring: ' + queryString)  
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
    else notFound(req, res)
  }
}

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
      res.writeHead(400, {'Content-Type': 'text/plain'});
      res.write('invalid JSON: ' + err.message);
      res.end();          
    }
    if (jso) callback(req, res, jso);
  });
}

function methodNotAllowed(req, res) {
  var body = 'Method not allowed. request-target: ' + req.url + ' method: ' + req.method + '\n';
  res.writeHead(405, {'Content-Type': 'text/plain',
                      'Content-Length': Buffer.byteLength(body)});
  res.end(err);
}

function notFound(req, res) {
  var body = 'Not Found. request-target: ' + req.url + ' method: ' + req.method + '\n';
  res.writeHead(404, {'Content-Type': 'text/plain',
                      'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}

function badRequest(res, err) {
  res.writeHead(400, {'Content-Type': 'text/plain',
                      'Content-Length': Buffer.byteLength(err)});
  res.end(err)
}   

function found(req, res, body, location, etag) {
  var headers =  {}
  if (location != null) headers['Content-Location'] = location; 
  if (etag != null) headers['Etag'] = etag; 
  respond(req, res, 200, headers, body)
}

function created(req, res, body, location, etag) {
  var headers =  {}
  if (location != null) headers['Location'] = location; 
  if (etag != null) headers['Etag'] = etag; 
  respond(req, res, 201, headers, body)
}

function respond(req, res, status, headers, body) {
  if (body != null) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
    headers['Content-Length'] = Buffer.byteLength(body);
    res.writeHead(status, headers);
    res.end(body)
  }
  else { 
    headers['Content-Length'] = 0;
    res.writeHead(status, headers);
    res.end(body)
  }
}

function internalizeURL(anURL, authority) {
  var httpString = 'http://' + authority;
  var httpsString = 'https://' + authority;  
  if (anURL.lastIndexOf(httpString) === 0) return anURL.substring(httpString.length);
  else if (anURL.lastIndexOf(httpsString) === 0) return anURL.substring(httpsString.length);
  else return anURL
}

function internalizeURLs(jsObject, authority) {
  //strip the http://authority or https://authority from the front of any urls
  if (typeof jsObject == 'object') {
    var httpString = 'http://' + authority;
    var httpsString = 'https://' + authority;
    for(var key in jsObject) {
      if (jsObject.hasOwnProperty(key)) {
        var val = jsObject[key];
        if (typeof val == 'string') {
          if (val.lastIndexOf(httpString) === 0) jsObject[key] = val.substring(httpString.length);
          else if (val.lastIndexOf(httpsString) === 0) jsObject[key] = val.substring(httpsString.length);
        } else if (Array.isArray(val)) {
          for (var i = 0; i < val.length; i++) {
            var vali = val[i]
            if (typeof vali == 'string') {
              if (vali.lastIndexOf(httpString) === 0) val[i] = vali.substring(httpString.length);
              else if (vali.lastIndexOf(httpsString) === 0) val[i] = vali.substring(httpsString.length);
            } else internalizeURLs(vali, authority)             
          }
        } else internalizeURLs(val, authority)
      }
    }
  }
}  

function externalizeURLs(jsObject, authority, protocol) {
  //add http://authority or https://authority to the front of any urls
  if (typeof jsObject == 'object') {
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
            else internalizeURLs(vali, authority)             
          }
        } else internalizeURLs(val, authority)
      }
    }
  }
}  

// End generic http functions that could be moved to a library
//==============================================================================

pool.query('CREATE TABLE IF NOT EXISTS permissions (subject text primary key, etag serial, data jsonb);', function(err, pg_res) {
  if(err) console.error('error creating permissions table', err);
  else {
    http.createServer(requestHandler).listen(3001, function() {
      console.log('server is listening on 3001')
    })
  }
})