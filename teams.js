'use strict';
var http = require('http');
var Pool = require('pg').Pool;
var url = require('url');
var querystring = require('querystring');
var lib = require('./standard-functions.js');
var request = require('request');

var PROTOCOL = process.env.PROTOCOL || 'http';
var TEAM = '/dGVh-';

var config = {
  host: 'localhost',
  user: 'martinnally',
  password: 'martinnally',
  database: 'permissions'
};

process.on('unhandledRejection', function(e) {
  console.log(e.message, e.stack);
});

var pool = new Pool(config);

function verifyTeam(team) {
  if (team.isA == 'Team') {
    return null
  } else { 
    return 'invalid JSON: "isA" property not set to "Team"';
  }
}

function createTeam(req, res, team) {
  lib.ifUserHasPermissionThen(req, res, 'create', function() {
    var err = verifyTeam(team);
    if (err !== null) {
      lib.badRequest(res, err);
    } else {
      lib.internalizeURLs(team, req.headers.host);
      pool.query('INSERT INTO teams (data) values($1) RETURNING *', [team], function (err, pg_res) {
        if (err) {
          lib.badRequest(res, err);
        } else {
          var etag = pg_res.rows[0].etag;
          var key = pg_res.rows[0].key;
          addCalculatedProperties(team, key, req)
          lib.created(req, res, team, team._self, etag);
        }
      });
    }
  });
}

function addCalculatedProperties(team, key, req) {
  team._self = PROTOCOL + '://' + req.headers.host + TEAM + key;
}

function getTeam(req, res, id) {
  lib.ifUserHasPermissionThen(req, res, 'read', function() {
    pool.query('SELECT etag, data FROM teams WHERE id = $1', [id], function (err, pg_res) {
      if (err) {
        lib.badRequest(res, err);
      }
      else {
        if (pg_res.rowCount === 0) { 
          lib.notFound(req, res);
        }
        else {
          var row = pg_res.rows[0];
          lib.externalizeURLs(row.data, req.headers.host, PROTOCOL);
          addCalculatedProperties(row.data, req); 
          lib.found(req, res, roe.data, row.etag);
        }
      }
    });
  });
}

function deleteTeam(req, res, id) {
  lib.ifUserHasPermissionThen(req, res, 'delete', function() {
    pool.query('DELETE FROM teams WHERE id = $1', [id], function (err, pg_res) {
      if (err) { 
        lib.badRequest(res, err);
      } else { 
        if (pg_res.rowCount === 0) {
          addCalculatedProperties(key, req); 
          lib.notFound(req, res);
        } else {
          lib.found(req, res, permissions, etag);
        }
      }
    });
  });
}

function updateTeam(req, res, id, patch) {
  lib.ifUserHasPermissionThen(req, res, 'update', function(team, etag) {
    var patchedTeam = mergePatch(team, patch);
    pool.query('UPDATE team SET data = ($1) WHERE id = $2 RETURNING etag' , [patchedPermissions, id], function (err, pg_res) {
      if (err) { 
        lib.badRequest(res, err);
      } else {
        if (pg_res.rowCount === 0) { 
          lib.notFound(req, res);
        } else {
          var row = pg_res.rows[0];
          addCalculatedProperties(patchedPermissions, id, req); 
          lib.found(req, res, team, row.etag);
        }
      }
    });
  });
}

function requestHandler(req, res) {
  if (req.url == '/teams') {
    if (req.method == 'POST') {
      lib.getPostBody(req, res, createTeam);
    } else { 
      lib.methodNotAllowed(req, res);
    }
  } else {
    var req_url = url.parse(req.url);
    if (req_url.pathname.lastIndexOf(TEAM, 0) > -1) {
      var id = req_url.pathname.substring(TEAM.length);
      if (req.method == 'GET') {
        getTeam(req, res, id);
      } else if (req.method == 'DELETE') { 
        deleteTeam(req, res, id);
      } else if (req.method == 'PATCH') { 
        lib.getPostBody(req, res, function (req, res, jso) {
          updateTeam(req, res, id, jso)
        });
      } else {
        lib.methodNotAllowed(req, res);
      }
    } else {
      lib.notFound(req, res);
    }
  }
}

pool.query('CREATE TABLE IF NOT EXISTS teams (id serial primary key, etag serial, data jsonb);', function(err, pg_res) {
  if(err) {
    console.error('error creating teams table', err);
  } else {
    http.createServer(requestHandler).listen(3002, function() {
      console.log('server is listening on 3002');
    });
  }
});