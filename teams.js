'use strict';
var http = require('http');
var Pool = require('pg').Pool;
var url = require('url');
var lib = require('http-helper-functions');
var uuid = require('node-uuid');
var db = require('./teams-db.js');

var PROTOCOL = process.env.PROTOCOL || 'http';
var TEAMS = '/teams/';

var config = {
  host: 'localhost',
  user: 'martinnally',
  password: 'martinnally',
  database: 'permissions'
};

var pool = new Pool(config);

function verifyTeam(req, team, user) {
  var rslt = lib.setStandardCreationProperties(req, team, user);
  if (team.isA == 'Team') {
    if (Array.isArray(team.members)) {
      return null;
    } else {
      return 'team must have an array of members';
    }
  } else { 
    return 'invalid JSON: "isA" property not set to "Team" ' + JSON.stringify(team);
  }
}

function createTeam(req, res, team) {
  var user = lib.getUser(req);
  if (user == null) {
    lib.unauthorized(req, res);
  } else { 
    var err = verifyTeam(req, team, user);
    if (err !== null) {
      lib.badRequest(res, err);
    } else {
      lib.internalizeURLs(team, req.headers.host); 
      var permissions = team.permissions;
      if (permissions !== undefined) {
        delete team.permissions;
      }
      var id = uuid();
      var selfURL = makeSelfURL(id, req);
      lib.createPermissonsFor(req, res, selfURL, permissions, function(permissionsURL, permissions){
        // Create permissions first. If we fail after creating the permissions resource but before creating the main resource, 
        // there will be a useless but harmless permissions document.
        // If we do things the other way around, a team without matching permissions could cause problems.
        db.createTeamThen(req, res, id, selfURL, team, function(etag) {
          team._self = selfURL; 
          lib.created(req, res, team, team._self, etag);
        });
      });
    }
  }
}

function makeSelfURL(key, req) {
  return PROTOCOL + '://' + req.headers.host + TEAMS + key;
}

function getTeam(req, res, id) {
  lib.ifAllowedThen(req, res, 'read', function() {
    db.withTeamDo(req, res, id, function(team , etag) {
      lib.externalizeURLs(team, req.headers.host, PROTOCOL);
      row.data._self = selfURL(req, id); 
      lib.found(req, res, team, etag);
    });
  });
}

function deleteTeam(req, res, id) {
  lib.ifAllowedThen(req, res, 'delete', function() {
    pool.query('DELETE FROM teams WHERE id = $1 RETURNING *', [id], function (err, pg_res) {
      if (err) { 
        lib.badRequest(res, err);
      } else { 
        if (pg_res.rowCount === 0) {
          lib.notFound(req, res);
        } else {
          var team = pg_res.rows[0];
          lib.found(req, res, team, team.etag);
        }
      }
    });
  });
}

function updateTeam(req, res, id, patch) {
  lib.ifAllowedThen(req, res, 'update', function(team, etag) {
    var patchedTeam = mergePatch(team, patch);
    pool.query('UPDATE team SET data = ($1) WHERE id = $2 RETURNING etag' , [patchedPermissions, id], function (err, pg_res) {
      if (err) { 
        lib.internalError(res, err);
      } else {
        if (pg_res.rowCount === 0) { 
          lib.notFound(req, res);
        } else {
          var row = pg_res.rows[0];
          patchedPermissions._self = selfURL(id, req); 
          lib.found(req, res, team, row.etag);
        }
      }
    });
  });
}

function getTeamsForUser(req, res, user) {
  var requestingUser = lib.getUser(req);
  user = lib.internalizeURL(user, req.headers.host);
  if (user == requestingUser) {
    var query = "SELECT id FROM teams, jsonb_array_elements(teams.data->'members') AS member WHERE member = $1"
    //var query = 'SELECT id FROM teams WHERE $1 IN teams.data.members';
    pool.query(query, [JSON.stringify(user)], function (err, pg_res) {
      if (err) {
        lib.internalError(res, err);
      }
      else {
        var result = [];
        var rows = pg_res.rows;
        for (var i = 0; i < rows.length; i++) {result.push(PROTOCOL + '://' + req.headers.host + TEAMS + rows[i].id);}
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
      lib.getServerPostBody(req, res, createTeam);
    } else { 
      lib.methodNotAllowed(req, res, ['POST']);
    }
  } else {
    var req_url = url.parse(req.url);
    if (req_url.pathname.lastIndexOf(TEAMS, 0) > -1) {
      var id = req_url.pathname.substring(TEAMS.length);
      if (req.method == 'GET') {
        getTeam(req, res, id);
      } else if (req.method == 'DELETE') { 
        deleteTeam(req, res, id);
      } else if (req.method == 'PATCH') { 
        lib.getPostBody(req, res, function (req, res, jso) {
          updateTeam(req, res, id, jso)
        });
      } else {
        lib.methodNotAllowed(req, res, ['GET', 'DELETE', 'PATCH']);
      }
    } else if (req_url.pathname == '/teams' && req_url.search !== null) {
      getTeamsForUser(req, res, req_url.search.substring(1));
    } else {
      lib.notFound(req, res);
    }
  }
}

db.init(function(){
  var port = process.env.PORT;
  http.createServer(requestHandler).listen(port, function() {
    console.log(`server is listening on ${port}`);
  });
});