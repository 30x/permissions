'use strict';
var http = require('http');

var PROTOCOL = process.env.PROTOCOL || 'http:';
var INTERNALURLPREFIX = 'protocol://authority';

function withTeamsDo(req, res, user, callback) {
  if (user !== null) {
    user = internalizeURL(user);
    var headers = {
      'Accept': 'application/json'
    }
    if (req.headers.authorization !== undefined) {
      headers.authorization = req.headers.authorization; 
    }
    var hostParts = req.headers.host.split(':');
    var options = {
      protocol: PROTOCOL,
      hostname: hostParts[0],
      path: '/teams?' + user,
      method: 'GET',
      headers: headers
    };
    if (hostParts.length > 1) {
      options.port = hostParts[1];
    }
    var clientReq = http.request(options, function (clientResponse) {
      getClientResponseBody(clientResponse, function(body) {
        if (clientResponse.statusCode == 200) { 
          var actors = JSON.parse(body);
          internalizeURLs(actors, req.headers.host);
          actors.push(user);
          callback(actors);
        } else {
          var err = `withTeamsDo: unable to retrieve /teams?user for user ${user} statusCode ${clientResponse.statusCode}`
          console.log(err)
          internalError(res, err);
        }
      });
    });
    clientReq.on('error', function (err) {
      console.log(`withTeamsDo: error ${err}`)
      internalError(res, err);
    });
    clientReq.end();
  } else {
    callback(null);
  }
}

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
    if (jso !== undefined) {
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

function methodNotAllowed(req, res, allow) {
  var body = 'Method not allowed. request-target: ' + req.url + ' method: ' + req.method + '\n';
  body = JSON.stringify(body);
  res.writeHead(405, {'Content-Type': 'application/json',
                      'Content-Length': Buffer.byteLength(body),
                      'Allow': allow.join(', ') });
  res.end(body);
}

function notFound(req, res) {
  var body = 'Not Found. component: ' + process.env.COMPONENT + ' request-target: ' + req.url + ' method: ' + req.method + '\n';
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
  respond(req, res, 200, headers, body);
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
    externalizeURLs(body, req.headers.host);
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
  if (anURL.lastIndexOf(httpString, 0) === 0) {
    return INTERNALURLPREFIX + anURL.substring(httpString.length);
  } else if (anURL.lastIndexOf(httpsString, 0) === 0) {
    return INTERNALURLPREFIX + anURL.substring(httpsString.length);
  } else {
    return anURL;
  }
}

function internalizeURLs(jsObject, authority) {
  //strip the http://authority or https://authority from the front of any urls
  if (Array.isArray(jsObject)) {
    for (var i = 0; i < jsObject.length; i++) {
      jsObject[i] = internalizeURLs(jsObject[i], authority);
    }             
  } else if (typeof jsObject == 'object') {
    for(var key in jsObject) {
      if (jsObject.hasOwnProperty(key)) {
        jsObject[key] = internalizeURLs(jsObject[key], authority);
      }
    }
  } else if (typeof jsObject == 'string') {
    return internalizeURL(jsObject, authority)
  }
  return jsObject;
}

function externalizeURLs(jsObject, authority) {
  //add http://authority or https://authority to the front of any urls
  if (Array.isArray(jsObject)) {
    for (var i = 0; i < jsObject.length; i++) {
      jsObject[i] = externalizeURLs(jsObject[i], authority);
    }
  } else if (typeof jsObject == 'object') {
    for(var key in jsObject) {
      if (jsObject.hasOwnProperty(key)) {
        jsObject[key] = externalizeURLs(jsObject[key], authority);
      }
    }
  } else if (typeof jsObject == 'string') {
    if (jsObject.lastIndexOf(INTERNALURLPREFIX, 0) === 0) {
      var prefix = PROTOCOL + '//' + authority;
      return prefix + jsObject.substring(INTERNALURLPREFIX.length);
    }
  }             
  return jsObject
}  

function createPermissonsFor(serverReq, serverRes, resourceURL, permissions, callback) {
  var user = getUser(serverReq);
  if (user == null) {
    unauthorized(serverReq, serverRes);
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
        badRequest(serverRes, 'governs must be set for permissions')
      } else {
        if (permissions.governs._self === undefined) {
          permissions.governs._self = resourceURL
        } else {
          if (permissions.governs._self != resourceURL) {
            badRequest(serverRes, 'value of governs must match resourceURL')
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
    if (serverReq.headers.authorization) {
      headers.authorization = serverReq.headers.authorization; 
    }
    var hostParts = serverReq.headers.host.split(':');
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
    var clientReq = http.request(options, function (clientRes) {
      getClientResponseBody(clientRes, function(body) {
        if (clientRes.statusCode == 201) { 
          body = JSON.parse(body);
          internalizeURLs(body, serverReq.headers.host);
          callback(resourceURL, body);
        } else if (clientRes.statusCode == 400) {
          badRequest(serverRes, body);
        } else if (clientRes.statusCode == 403) {
          forbidden(serverReq, serverRes);
        } else {
          var err = {statusCode: clientRes.statusCode,
            msg: 'failed to create permissions for ' + resourceURL + ' statusCode ' + clientRes.statusCode + ' message ' + JSON.stringify(clientRes.body)
          }
          internalError(serverRes, err);
        }
      });
    });
    clientReq.on('error', function (err) {
      internalError(serverRes, err);
    });
    clientReq.write(postData);
    clientReq.end();
  }
}

function withAllowedDo(req, serverRes, resourceURL, action, callback) {
  var user = getUser(req);
  var permissionsURL = '/is-allowed?resource=' + resourceURL;
  if (user !== null) {
    permissionsURL += '&user=' + user;
  }
  if (action !== null) {
    permissionsURL += '&action=' + action;
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
  var clientReq = http.request(options, function (clientRes) {
    getClientResponseBody(clientRes, function(body) {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.error('withAllowedDo: JSON parse failed. options:', options, 'body:', body, 'error:', e);
      }
      if (clientRes.statusCode == 200) { 
        callback(body);
      } else {
        internalError(serverRes, `failed permissions request: ${clientRes.statusCode} URL: ${permissionsURL} body: ${body}`);
      }
    });
  });
  clientReq.on('error', function (err) {
    internalError(serverRes, `failed permissions request: ${err} URL: ${permissionsURL}`);
  });
  clientReq.end();
}

function ifAllowedThen(req, res, action, callback) {
  var resourceURL = PROTOCOL + '//' + req.host + req.url;
  withAllowedDo(req, res, resourceURL, action, function(allowed) {
    if (body === true) {
      callback();
    } else {
      if (user !== null) {
        forbidden(req, res);
      } else { 
        unauthorized(req, res);
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
exports.ifAllowedThen = ifAllowedThen;
exports.withAllowedDo = withAllowedDo;
exports.mergePatch = mergePatch;
exports.internalError = internalError;
exports.createPermissonsFor = createPermissonsFor;
exports.setStandardCreationProperties = setStandardCreationProperties;
exports.getUserFromToken = getUserFromToken;
exports.withTeamsDo=withTeamsDo;