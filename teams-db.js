'use strict';
var Pool = require('pg').Pool;
var lib = require('http-helper-functions');
var pge = require('./pg-event-producer.js');

var config = {
  host: 'localhost',
  user: 'martinnally',
  password: 'martinnally',
  database: 'permissions'
};

var pool = new Pool(config);
var eventProducer = new pge.eventProducer(pool);

function createTeamThen(req, res, id, selfURL, team, callback) {
  lib.internalizeURLs(team, req.headers.host);
  var query = `INSERT INTO teams (id, data) values('${id}', '${JSON.stringify(team)}') RETURNING etag`;
  function eventData(pgResult) {
    return {id: selfURL, action: 'create', etag: pgResult.rows[0].etag}
  }
  pge.queryAndStoreEvent(req, res, pool, query, 'teams', eventData, eventProducer, function(pgResult, pgEventResult) {
    callback(pgResult.rows[0].etag);
  });
}

function withTeamDo(req, res, id, callback) {
  lib.ifAllowedThen(req, res, 'read', function() {
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
          callabck(row.data, row.etag);
        }
      }
    });
  });
}

function deleteTeamThen(req, res, id, callback) {
  var query = `DELETE FROM teams WHERE id = '${id}' RETURNING *`;
  function eventData(pgResult) {
    return {id: id, action: 'delete', etag: pgResult.rows[0].etag}
  }
  pge.queryAndStoreEvent(req, res, pool, query, 'teams', eventData, eventProducer, function(pgResult, pgEventResult) {
    callback(pgResult.rows[0].data, pgResult.rows[0].etag);
  });

}

function updateTeamThen(req, res, id, patchedTeam, etag, callback) {
  lib.internalizeURLs(patchedTeam, req.headers.host);
  var key = lib.internalizeURL(id, req.headers.host);
  var query = `UPDATE teams SET data = ('${JSON.stringify(patchedTeam)}') WHERE subject = '${key}' AND etag = ${etag} RETURNING etag`;
  function eventData(pgResult) {
    return {id: id, action: 'update', etag: pgResult.rows[0].etag}
  }
  pge.queryAndStoreEvent(req, res, pool, query, 'teams', eventData, eventProducer, function(pgResult, pgEventResult) {
    callback(pgResult.rows[0].etag);
  });
}

function init(callback) {
  var query = 'CREATE TABLE IF NOT EXISTS permissions (subject text primary key, etag serial, data jsonb);'
  pool.query(query, function(err, pgResult) {
    if(err) {
      console.error('error creating permissions table', err);
    } else {
      eventProducer.init(callback);
    }
  });    
}

exports.createTeamThen = createTeamThen;
exports.updateTeamThen = updateTeamThen;
exports.deleteTeamThen = deleteTeamThen;
exports.withTeamDo = withTeamDo;
exports.init = init;