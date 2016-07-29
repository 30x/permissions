'use strict';
/* 
We dislike prerequisites and avoid them where possible. We especially dislike prereqs that have a 'framework' style; simple libraries are more palatable.
The current code uses http. Because of Node's callback style, http has a slightly 'frameworky' feel, but it is not practical to avoid these libraries.
Please do not add any framework to this preqs. We do not want express or anything like it. We do not want any sort of "ORM" or similar.
Adding simple library prereqs could be OK if the value they bring is in proportion to the problme being solved.
*/
var http = require('http');

var PROTOCOL = process.env.PROTOCOL || 'http:';
var INTERNALURLPREFIX = 'protocol://authority';

function getServerPostBody(req, res, callback) {
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

function getClientResponseBody(res, callback) {
  res.setEncoding('utf8');
  var body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    callback(body);
  });
}

function getUserFromToken(token) {
  var claims64 = token.split('.');
  if (claims64.length != 3) {
    return null;
  } else {
    var claimsString = new Buffer(claims64[1], 'base64').toString();
    var claims = JSON.parse(claimsString);
    return claims.user_id;
  }
}

function getUser(req) {
  var auth = req.headers.authorization;
  if (auth == undefined) {
    return null;
  } else {
    var auth_parts = auth.match(/\S+/g);
    if (auth_parts.length < 2 || auth_parts[0].toLowerCase() != 'bearer') {
      return null;
    } else {
      return getUserFromToken(auth_parts[1]);
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
    headers['Content-Location'] = PROTOCOL + '//' + req.headers.host + req.url; //todo - handle case where req.url includes http://authority
  }
  if (etag !== undefined) {
    headers['Etag'] = etag;
  } 
  respond(req, res, 200, headers, externalizeURLs(body, req.headers.host));
}

function created(req, res, body, location, etag) {
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
    body += '\n';
    headers['Content-Length'] = Buffer.byteLength(body);
    res.writeHead(status, headers);
    res.end(body);
  } else { 
    res.writeHead(status, headers);
    res.end();
  }
}

function internalizeURL(anURL, authority) {
  var httpString = 'http://' + authority;
  var httpsString = 'https://' + authority;  
  if (anURL.lastIndexOf(httpString) === 0) {
    return INTERNALURLPREFIX + anURL.substring(httpString.length);
  } else if (anURL.lastIndexOf(httpsString) === 0) {
    return INTERNALURLPREFIX + anURL.substring(httpsString.length);
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
        jsObject[key] = internalizeURLs(jsObject[key], authority);
      }
    }
  } else if (Array.isArray(jsObject)) {
    for (var i = 0; i < jsObject.length; i++) {
      jsObject[i] = internalizeURLs(jsObject[i], authority);
    }             
  } else if (typeof vali == 'string') {
    if (jsObject.lastIndexOf(httpString) === 0) {
      return INTERNALURLPREFIX + jsObject.substring(httpString.length);
    } else if (jsObject.lastIndexOf(httpsString) === 0) {
      return INTERNALURLPREFIX + jsObject.substring(httpsString.length);
    }
  }
  return jsObject;
}

function externalizeURLs(jsObject, authority, protocol) {
  //add http://authority or https://authority to the front of any urls
  if (typeof jsObject == 'object') {
    var prefix = protocol + '//' + authority;
    for(var key in jsObject) {
      if (jsObject.hasOwnProperty(key)) {
        jsObject[key] = externalizeURLs(jsObject[key], authority);
      }
    }
  } else if (Array.isArray(jsObject)) {
    for (var i = 0; i < jsObject.length; i++) {
      jsObject[i] = externalizeURLs(jsObject[i], authority);
    }
  } else if (typeof jsObject == 'string') {
    if (jsObject.lastIndexOf('INTERNALURLPREFIX') === 0) {
      return prefix + jsObject.substring(INTERNALURLPREFIX.length);
    }
  }             
  return jsObject
}  

function withPermissionsDo(req, resourceURL, callback) {
  var user = getUser(req);
  var permissionsURL = '/allowed-actions?resource=' + resourceURL;
  if (user !== null) {
    permissionsURL += '&user=' + user;
  }
  var headers = {
    'Accept': 'application/json'
  }
  if (req.headers.authorization) {
    headers.authorization = req.headers.authorization; 
  }
  var hostParts = req.headers.host.split(':');
  var options = {
    protocol: PROTOCOL,
    hostname: hostParts[0],
    path: permissionsURL,
    method: 'GET',
    headers: headers
  };
  if (hostParts.length > 1) {
    options.port = hostParts[1];
  }
  var client_req = http.request(options, function (res) {
    getClientResponseBody(res, function(body) {
      if (res.statusCode == 200) { 
        body = JSON.parse(body);
        internalizeURLs(body, req.headers.host);
        callback(null, resourceURL, body);
      } else {
        callback(response.statusCode, resourceURL);
      }
    });
  });
  client_req.on('error', function (err) {
    callback(err, resourceURL);
  });
  client_req.end();
}

function createPermissonsFor(server_req, server_res, resourceURL, permissions, callback) {
  var user = getUser(server_req);
  if (user == null) {
    unauthorized(server_req, server_res);
  } else {
    if (permissions === null || permissions === undefined) {
      permissions = {
        isA: 'Permissions',
        readers: [user],
        writers: [user],
        updaters: [user],
        governs: {
          _self: resourceURL,
          readers: [user],
          writers: [user],
          updaters: [user],
          creators: [user]
        }
      }  
    } else {
      if (permissions.governs === undefined) {
        badRequest(server_res, 'governs must be set ofr permissions')
      } else {
        if (permissions.governs._self === undefined) {
          permissions.governs._self = resourceURL
        } else {
          if (permissions.governs._self != resourceURL) {
            badRequest(server_res, 'value of governs must match resourceURL')
          }
        }
      }
    }
    var postData = JSON.stringify(permissions);
    var headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
    if (server_req.headers.authorization) {
      headers.authorization = server_req.headers.authorization; 
    }
    var hostParts = server_req.headers.host.split(':');
    var options = {
      protocol: PROTOCOL,
      hostname: hostParts[0],
      path: '/permissions',
      method: 'POST',
      headers: headers
    };
    if (hostParts.length > 1) {
      options.port = hostParts[1];
    }
    var body = JSON.stringify(permissions);
    var client_req = http.request(options, function (client_res) {
      getClientResponseBody(client_res, function(body) {
        if (client_res.statusCode == 201) { 
          body = JSON.parse(body);
          internalizeURLs(body, server_req.headers.host);
          callback(resourceURL, body);
        } else if (client_res.statusCode == 400) {
          badRequest(server_res, body);
        } else {
          var err = {statusCode: client_res.statusCode,
            msg: 'failed to create permissions for ' + resourceURL + ' statusCode ' + client_res.statusCode + ' message ' + JSON.stringify(client_res.body)
          }
          internalError(server_res, err);
        }
      });
    });
    client_req.on('error', function (err) {
      internalError(server_res, err);
    });
    client_req.write(postData);
    client_req.end();
  }
}

function ifUserHasRequestTargetPermissionThen(req, res, action, callback) {
  var user = getUser(req);
  var resourceURL = PROTOCOL + '//' + req.host + req.url;
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
  if (typeof patch == 'object' && !Array.isArray(patch)) {
    if (typeof target != 'object') {
      target = {}; // don't just return patch since it may have nulls; perform the merge
    } else {
      target = Object.assign({}, target);
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

function setStandardCreationProperties(req, resource, user) {
  if (resource.creator) {
    return 'may not set creator'
  } else {
    resource.creator = user
  }
  if (resource.modifier) {
    return 'may not set modifier'
  } else {
    resource.modifier = user
  }
  if (resource.created) {
    return 'may not set created'
  } else {
    resource.creator = new Date().toISOString()
  }
  if (resource.modified) {
    return 'may not set modified'
  } else {
    resource.modified = resource.created
  }
  return null;
}

function createResource(req, res, resource, primCreate) {
  var user = getUser(req);
  if (user == null) {
    unauthorized(req, res)
  } else {
    var count = 0;
    var errors = [];
    if (resource.inheritsPermissionsOf !== undefined) {
      for (var i=0; i < resource.inheritsPermissionsOf.length; i++) {
        withPermissionsDo(req, resource.inheritsPermissionsOf[i], function(err, sharingSet, actions){
          if (err == 404) {
            errors.push('sharingSet ' + sharingSet + ' is not a governed resource');
          } else if (err !== null) {
            errors.push(err);
          } else if (actions.indexOf('create') == -1) {
            errors.push('user not permitted to create in sharingSet ' + sharingSet);
          }
          if (++count == resource.inheritsPermissionsOf.length) {
            if (errors.length == 0) {
              primCreate(req, res, resource);
            } else {
              badRequest(res, errors);
            }
          }
        });
      }
    } else {
      primCreate(req, res, resource);
    }
  }
}

exports.getServerPostBody = getServerPostBody;
exports.getClientResponseBody = getClientResponseBody;
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
exports.createResource = createResource;
exports.setStandardCreationProperties = setStandardCreationProperties;
exports.getUserFromToken = getUserFromToken;