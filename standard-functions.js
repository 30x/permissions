'use strict';

var PROTOCOL = process.env.PROTOCOL || 'http';

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

function getUser(req) {
  // temp for testing
  return req.headers.user
}

function methodNotAllowed(req, res) {
  var body = 'Method not allowed. request-target: ' + req.url + ' method: ' + req.method + '\n';
  res.writeHead(405, {'Content-Type': 'text/plain',
                      'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}

function notFound(req, res) {
  var body = 'Not Found. request-target: ' + req.url + ' method: ' + req.method + '\n';
  res.writeHead(404, {'Content-Type': 'text/plain',
                      'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}

function forbidden(req, res) {
  var body = 'Forbidden. request-target: ' + req.url + ' method: ' + req.method + '\n';
  res.writeHead(403, {'Content-Type': 'text/plain',
                      'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}

function unauthorized(req, res) {
  var body = 'Unauthorized. request-target: ' + req.url;
  res.writeHead(403, {'Content-Type': 'text/plain',
                      'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}

function badRequest(res, err) {
  var body = JSON.stringify(err)
  res.writeHead(400, {'Content-Type': 'application/json',
                      'Content-Length': Buffer.byteLength(body)});
  res.end(body)
}   

function found(req, res, body, etag, location) {
  var headers =  {}
  if (location != null) headers['Content-Location'] = location; 
  else headers['Content-Location'] = PROTOCOL + '://' + req.headers.host + req.url; //todo - handle case where req.url includes http://authority
  if (etag != null) headers['Etag'] = etag; 
  respond(req, res, 200, headers, body)
}

function created(req, res, body, etag, location) {
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

exports.getPostBody = getPostBody;
exports.methodNotAllowed = methodNotAllowed;
exports.notFound = notFound;
exports.badRequest = badRequest;
exports.found = found;
exports.created = created;
exports.respond = respond;
exports.internalizeURL = internalizeURL;
exports.internalizeURLs = internalizeURLs;
exports.externalizeURLs = externalizeURLs
exports.getUser = getUser
exports.forbidden = forbidden
exports.unauthorized = unauthorized