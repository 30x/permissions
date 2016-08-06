'use strict';
var Pool = require('pg').Pool;
var lib = require('./standard-functions.js');
var dblib = require('./standard-db-functions.js');
var pge = require('./pgEventProducer.js');

var ANYONE = 'http://apigee.com/users/anyone';
var INCOGNITO = 'http://apigee.com/users/incognito';

var config = {
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
};

var pool = new Pool(config);
var eventProducer = new pge.eventProducer(pool);

function withPermissionsDo(req, res, subject, callback) {
  // fetch the permissions resource for `subject`.
  subject = lib.internalizeURL(subject, req.headers.host);
  var query = 'SELECT etag, data FROM permissions WHERE subject = $1';
  pool.query(query,[subject], function (err, pgResult) {
    if (err) {
      lib.internalError(res, err);
    } else {
      if (pgResult.rowCount === 0) { 
        lib.notFound(req, res);
      }
      else {
        var row = pgResult.rows[0];
        callback(row.data, row.etag);
      }
    }
  });
}

function deletePermissionsThen(req, res, subject, callback) {
  // fetch the permissions resource for `subject`.
  subject = lib.internalizeURL(subject, req.headers.host);
  pool.connect(function(err, client, release) {
    if (err) { 
      lib.badRequest(res, err);
    } else {
      client.query('BEGIN', function(err) {
        if(err) {
          client.query('ROLLBACK', release);
          lib.internalError(res, err);
        } else {
          var key = lib.internalizeURL(subject, req.headers.host);
          var query = 'DELETE FROM permissions WHERE subject = $1 RETURNING *';
          client.query(query, [subject], function(err, pgResult) {
            if(err) {
              client.query('ROLLBACK', release);
              lib.badrequest(res, err);
            } else {
              if (pgResult.rowCount === 0) {
                client.query('ROLLBACK', release);
                lib.notFound(req, res);
              } else {
                var time = Date.now();
                var query = `INSERT INTO events (topic, eventtime, data) 
                             values ('permissions', ${time}, '{"subject": "${subject}", "action": "delete", "etag": ${pgResult.rows[0].etag}}')
                             RETURNING *`;
                client.query(query, function(err, pgEventResult) {
                  if(err) {
                    client.query('ROLLBACK', release);
                    lib.internalError(res, err);
                  } else {
                    if (pgEventResult.rowcount == 0) {
                      client.query('ROLLBACK', release);
                      lib.internalError(res, 'unable to create event');
                    } else {
                      client.query('COMMIT', release);
                      callback(pgResult.rows[0], pgEventResult.rows[0]);
                      eventProducer.tellConsumers(req, pgEventResult.rows[0]);
                    }
                  }
                });
              }
            }
          });
        }
      });
    }
  });  
  
}

function createPermissionsThen(req, res, permissions, callback) {
  lib.internalizeURLs(permissions, req.headers.host);
  var subject = permissions.governs._self;
  var query = `INSERT INTO permissions (subject, data) values('${subject}', '${JSON.stringify(permissions)}') RETURNING etag`;
  function eventData(pgResult) {
    return {subject: permissions.governs._self, action: "create", etag: pgResult.rows[0].etag}
  }
  dblib.queryAndStoreEvent(req, res, pool, query, 'permissions', eventData, eventProducer, function(pgResult, pgEventResult) {
    callback(permissions, pgResult.rows[0].etag);
  });
}

function updatePermissionsThen(req, res, subject, patchedPermissions, etag, callback) {
  lib.internalizeURLs(patchedPermissions, req.headers.host);
  var key = lib.internalizeURL(subject, req.headers.host);
  var query = `UPDATE permissions SET data = ('${JSON.stringify(patchedPermissions)}') WHERE subject = '${key}' AND etag = ${etag} RETURNING etag`;
  function eventData(pgResult) {
    return {subject: patchedPermissions.governs._self, action: "create", etag: pgResult.rows[0].etag}
  }
  dblib.queryAndStoreEvent(req, res, pool, query, 'permissions', eventData, eventProducer, function(pgResult, pgEventResult) {
    callback(patchedPermissions, pgResult.rows[0].etag);
  });
}

function withResourcesSharedWithActorsDo(req, res, actors, callback) {
  actors = actors == null ? [INCOGNITO] : actors.concat([INCOGNITO, ANYONE]);
  var query = `SELECT DISTINCT subject FROM permissions, jsonb_array_elements(permissions.data->'_sharedWith') 
               AS sharedWith WHERE sharedWith <@ '${JSON.stringify(actors)}'`;
  pool.query(query, function (err, pgResult) {
    if (err) {
      lib.badRequest(res, err);
    } else {
      callback(pgResult.rows.map((row) => {return row.subject;}))
    }
  });
}

function withHeirsDo(req, res, securedObject, callback) {
  var query = `SELECT subject, data FROM permissions WHERE data @> '{"governs": {"inheritsPermissionsOf":["${securedObject}"]}}'`
  pool.query(query, function (err, pgResult) {
    if (err) {
      lib.badRequest(res, err);
    }
    else {
      callback(pgResult.rows.map((row) => {return row.data.governs;}))
    }
  });
}

function createTablesThen(callback) {
  var query = 'CREATE TABLE IF NOT EXISTS permissions (subject text primary key, etag serial, data jsonb);'
  pool.query(query, function(err, pgResult) {
    if(err) {
      console.error('error creating permissions table', err);
    } else {
      callback()
    }
  });    
}

function init(callback) {
  createTablesThen(function () {
    eventProducer.init(callback);
  });
}

exports.withPermissionsDo = withPermissionsDo;
exports.createPermissionsThen = createPermissionsThen;
exports.deletePermissionsThen = deletePermissionsThen;
exports.updatePermissionsThen = updatePermissionsThen;
exports.withResourcesSharedWithActorsDo = withResourcesSharedWithActorsDo;
exports.withHeirsDo = withHeirsDo;
exports.init=init;