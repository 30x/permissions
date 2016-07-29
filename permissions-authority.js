'use strict';
var http = require('http');
var lib = require('./standard-functions.js');

var permissionsCache = {};
var userCache = {};
var teamCache = {};

var PROTOCOL = process.env.PROTOCOL || 'http:';

function withTeamsDo(req, user, callback) {
  if (user !== null) {
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
    var client_req = http.request(options, function (client_response) {
      lib.getClientResponseBody(client_response, function(body) {
        if (client_response.statusCode == 200) { 
          body = JSON.parse(body);
          body.push(user);
          lib.internalizeURLs(body, req.headers.host);
          callback(null, user, body);
        } else {
          callback(client_response.statusCode, user);
        }
      });
    });
    client_req.on('error', function (err) {
      callback(err, user);
    });
    client_req.end();
  } else {
    callback(null, user, null);
  }
}

exports.withTeamsDo = withTeamsDo;