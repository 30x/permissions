'use strict';

var PROTOCOL = process.env.PROTOCOL || 'http';
var request = require('request');

function getPostBody(req, res, callback) {
  var body = '';

  req.on('data', function (data) {
    if (body.length + data.length > 1e6){
      req.connection.destroy();
    }
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
    if (jso) {
      callback(req, res, jso);
    }
  });
}

function getUser(req) {
  var auth = req.headers.authorization
  if (auth == undefined) {
    return null;
  } else {
    var auth_parts = auth.match(/\S+/g);
    if (auth_parts.length < 2 || auth_parts[0].toLowerCase() != 'bearer') {
      return null;
    } else {
      var token = auth_parts[1];
      var claims64 = token.split('.');
      if (claims64.length != 3) {
        return null;
      } else {
        var claimsString = new Buffer(claims64[1], 'base64').toString();
        var claims = JSON.parse(claimsString);
        return claims.user_id;
      }
    }
  }
}

function methodNotAllowed(req, res) {
  var body = 'Method not allowed. request-target: ' + req.url + ' method: ' + req.method + '\n';
  body = JSON.stringify(body);
  res.writeHead(405, {'Content-Type': 'application/json',
                      'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}

function notFound(req, res) {
  var body = 'Not Found. request-target: ' + req.url + ' method: ' + req.method + '\n';
  body = JSON.stringify(body);
  res.writeHead(404, {'Content-Type': 'application/json',
                      'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}

function forbidden(req, res) {
  var body = 'Forbidden. request-target: ' + req.url + ' method: ' + req.method + '\n';
  body = JSON.stringify(body);
  res.writeHead(403, {'Content-Type': 'application/json',
                      'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}

function unauthorized(req, res) {
  var body = 'Unauthorized. request-target: ' + req.url;
  body = JSON.stringify(body);
  res.writeHead(403, {'Content-Type': 'application/json',
                      'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}

function badRequest(res, err) {
  var body = JSON.stringify(err);
  res.writeHead(400, {'Content-Type': 'application/json',
                      'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}   

function internalError(res, err) {
  var body = JSON.stringify(err);
  res.writeHead(500, {'Content-Type': 'application/json',
                      'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}   

function duplicate(res, err) {
  var body = JSON.stringify(err);
  res.writeHead(409, {'Content-Type': 'application/json',
                      'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}   

function found(req, res, body, etag, location) {
  var headers =  {};
  if (location !== undefined) {
    headers['Content-Location'] = location;
  } else {
    headers['Content-Location'] = PROTOCOL + '://' + req.headers.host + req.url; //todo - handle case where req.url includes http://authority
  }
  if (etag !== undefined) {
    headers['Etag'] = etag;
  } 
  respond(req, res, 200, headers, body);
}

function created(req, res, body, etag, location) {
  var headers =  {};
  if (location !== undefined) {
    headers['Location'] = location;
  } 
  if (etag !== undefined) {
    headers['Etag'] = etag; 
  }
  respond(req, res, 201, headers, body);
}

function respond(req, res, status, headers, body) {
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
    headers['Content-Length'] = Buffer.byteLength(body);
    res.writeHead(status, headers);
    res.end(body);
  } else { 
    headers['Content-Length'] = 0;
    res.writeHead(status, headers);
    res.end(body);
  }
}

function internalizeURL(anURL, authority) {
  var httpString = 'http://' + authority;
  var httpsString = 'https://' + authority;  
  if (anURL.lastIndexOf(httpString) === 0) {
    return anURL.substring(httpString.length);
  } else if (anURL.lastIndexOf(httpsString) === 0) {
    return anURL.substring(httpsString.length);
  } else {
    return anURL;
  }
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
          if (val.lastIndexOf(httpString) === 0) {
            jsObject[key] = val.substring(httpString.length);
          } else if (val.lastIndexOf(httpsString) === 0) {
            jsObject[key] = val.substring(httpsString.length);
          }
        } else if (Array.isArray(val)) {
          for (var i = 0; i < val.length; i++) {
            var vali = val[i];
            if (typeof vali == 'string') {
              if (vali.lastIndexOf(httpString) === 0) {
                val[i] = vali.substring(httpString.length);
              } else if (vali.lastIndexOf(httpsString) === 0) {
                val[i] = vali.substring(httpsString.length);
              }
            } else {
              internalizeURLs(vali, authority);
            }             
          }
        } else {
          internalizeURLs(val, authority);
        }
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
          if (val.lastIndexOf('/') === 0) {
            jsObject[key] = prefix + val;
          }
        } else if (Array.isArray(val)) {
          for (var i = 0; i < val.length; i++) {
            var vali = val[i];
            if (typeof vali == 'string') {
              if (vali.lastIndexOf('/') === 0) {
                val[i] = prefix + val;
              } else {
                internalizeURLs(vali, authority);
              }
            }             
          }
        } else {
          internalizeURLs(val, authority);
        }
      }
    }
  }
}  

function withPermissionsDo(req, resourceURL, callback) {
  var user = getUser(req);
  var permissionsURL = PROTOCOL + '://' + req.headers.host + '/allowed-actions?resource=' + resourceURL;
  if (user !== null) {
    permissionsURL += '&user=' + user;
  }
  var headers = {
    'Accept': 'application/json'
  }
  if (req.headers.authorization) {
    headers.authorization = req.headers.authorization; 
  }
  var options = {
    url: permissionsURL,
    headers: headers
  };
  request(options, function (err, response, body) {
    if (err) {
      callback(err, resourceURL);
    }
    else {
      if (response.statusCode == 200) { 
        callback(null, resourceURL, body)
      } else {
        callback(response.statusCode, resourceURL)
      }
    }
  });
}

function createPermissonsFor(req, resourceURL, sharingSets, callback) {
  var permissionsURL = PROTOCOL + '://' + req.headers.host + '/permissions';
  var headers = {
    'Accept': 'application/json'
  }
  if (req.headers.authorization) {
    headers.authorization = req.headers.authorization; 
  }
  var body = {
    isA: 'Permissions',
    governs: {
      _self: resourceURL,
      sharingSets: sharingSets,
    }
  }
  var options = {
    url: permissionsURL,
    headers: headers,
    method: 'POST',
    json: body
  }
  request(options, function (err, response, body) {
    if (err) {
      callback(err, resourceURL);
    }
    else {
      if (response.statusCode == 200) { 
        callback(null, resourceURL, body)
      } else {
        callback(response.statusCode, resourceURL)
      }
    }
  });
}

function ifUserHasRequestTargetPermissionThen(req, res, action, callback) {
  var user = getUser(req);
  var resourceURL = PROTOCOL + '://' + req.host + req.url;
  withPermissionsDo(req, resourceURL, function (err, resourceURL, permissions) {
    if (err) {
      internalError(res, err);
    } else {
      if (body.indexOf(action) > -1) { 
        callback()
      } else {
        if (user !== null) {
          forbidden(req, res);
        } else { 
          unauthorized(req, res);
        }
      }
    }
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

exports.getPostBody = getPostBody;
exports.methodNotAllowed = methodNotAllowed;
exports.notFound = notFound;
exports.badRequest = badRequest;
exports.duplicate = duplicate;
exports.found = found;
exports.created = created;
exports.respond = respond;
exports.internalizeURL = internalizeURL;
exports.internalizeURLs = internalizeURLs;
exports.externalizeURLs = externalizeURLs;
exports.getUser = getUser;
exports.forbidden = forbidden;
exports.unauthorized = unauthorized;
exports.ifUserHasRequestTargetPermissionThen = ifUserHasRequestTargetPermissionThen;
exports.withPermissionsDo = withPermissionsDo;
exports.mergePatch = mergePatch;
exports.internalError = internalError;
exports.createPermissonsFor = createPermissonsFor;