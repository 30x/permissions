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

var pool = new Pool(config);

function verifyTeam(team) {
  if (team.isA == 'Team') {
    if (Array.isArray(team.members)) {
      for (var i = 0; i < team.members.length; i++) {
        if (!typeof team.members[i] == 'string') {
          return 'members must be URLs encoded as strings';
        }
      }
      if (Array.isArray(team.sharingSets)) {
        if (team.sharingSets.length > 0) {
          for (var i = 0; i < team.sharingSets.length; i++) {
            if (!typeof team.sharingSets[i] == 'string') {
            return 'members must be URLs encoded as strings';
            }
          }
          return null;
        } else {
          return 'must provide at least one sharingSet';
        }
      } else {
        return 'sharingSets must present and must be an Array'
      }
    }
    else {
      return 'team must have an array of members';
    }
  } else { 
    return 'invalid JSON: "isA" property not set to "Team" ' + JSON.stringify(team);
  }
}

function primCreateTeam (req, res, team) {
  lib.internalizeURLs(team, req.headers.host);
  var sharingSets = team.sharingSets;
  delete team.sharingSets;
  pool.query('INSERT INTO teams (data) values($1) RETURNING *', [team], function (err, pg_res) {
    if (err) {
      lib.internalError(res, err);
    } else {
      var etag = pg_res.rows[0].etag;
      var key = pg_res.rows[0].id;
      addCalculatedProperties(team, key, req)
      lib.created(req, res, team, team._self, etag);
      lib.createPermissonsFor(req, team._self, sharingSets, function(statusCode, resourceURL){
        if (statusCode == 201) {
          console.log('permissions created for resource ' + resourceURL);
        } else {
          console.log('failed to create permissions for ' + resourceURL + ' statusCode ' + statusCode)
        }
      });
    }
  });
}

function createTeam(req, res, team) {
  var err = verifyTeam(team);
  if (err !== null) {
    lib.badRequest(res, err);
  } else {
    lib.createResource(req, res, team, primCreateTeam);
  }
}

function addCalculatedProperties(team, key, req) {
  team._self = PROTOCOL + '://' + req.headers.host + TEAM + key;
}

function getTeam(req, res, id) {
  lib.ifUserHasRequestTargetPermissionThen(req, res, 'read', function() {
    pool.query('SELECT etag, data FROM teams WHERE id = $1', [id], function (err, pg_res) {
      if (err) {
        lib.internalError(res, err);
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
  lib.ifUserHasRequestTargetPermissionThen(req, res, 'delete', function() {
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
  lib.ifUserHasRequestTargetPermissionThen(req, res, 'update', function(team, etag) {
    var patchedTeam = mergePatch(team, patch);
    pool.query('UPDATE team SET data = ($1) WHERE id = $2 RETURNING etag' , [patchedPermissions, id], function (err, pg_res) {
      if (err) { 
        lib.internalError(res, err);
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

function getTeamsForUser(req, res, user) {
  var requesting_user = lib.getUser(req);
  user = lib.internalizeURL(user, req.headers.host);
  if (user == requesting_user) {
    var query = "SELECT id FROM teams, jsonb_array_elements(teams.data->'members') AS member WHERE member = $1"
    //var query = 'SELECT id FROM teams WHERE $1 IN teams.data.members';
    pool.query(query, [JSON.stringify(user)], function (err, pg_res) {
      if (err) {
        lib.internalError(res, err);
      }
      else {
        var result = [];
        var rows = pg_res.rows;
        for (var i = 0; i < rows.length; i++) {result.push(PROTOCOL + '://' + req.headers.host + TEAM + rows[i].id);}
        lib.found(req, res, result);
      }
    });
  } else {
    lib.forbidden(req, res)
  }
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
    } else if (req_url.pathname == '/teams' && req_url.search !== null) {
      getTeamsForUser(req, res, req_url.search.substring(1));
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