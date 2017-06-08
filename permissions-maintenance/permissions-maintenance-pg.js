'use strict';
const Pool = require('pg').Pool;
const lib = require('http-helper-functions');
const pge = require('pg-event-producer');
const randomBytes = require('crypto').randomBytes

const ANYONE = 'http://apigee.com/users/anyone';
const INCOGNITO = 'http://apigee.com/users/incognito';

const config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
}

var pool
var eventProducer

const letters16 = 'abcdefghijklmnopqrst'
function generateDelimiter() {
  var buf = randomBytes(4), rslt = ''
  for (var i = 0; i < 4; i++) {
    rslt += letters16[buf[i] >>> 4]
    rslt += letters16[buf[i] & 0xf]
  }
  return rslt
}

function withPermissionsDo(req, subject, callback) {
  const query = 'SELECT etag, data FROM permissions WHERE subject = $1'
  pool.query(query,[subject], function (err, pgResult) {
    if (err)
      callback(err)
    else {
      if (pgResult.rowCount === 0) 
        callback(404)
      else {
        var row = pgResult.rows[0];
        callback(null, row.data, row.etag)
      }
    }
  })
}

function deletePermissionsThen(req, subject, callback) {
  var query = 'DELETE FROM permissions WHERE subject = $1 RETURNING *'
  function eventData(pgResult) {
    return {subject: subject, action: 'delete', etag: pgResult.rows[0].etag}
  }
  eventProducer.queryAndStoreEvent(req, query, [subject], 'permissions', eventData, function(err, pgResult, pgEventResult) {
    if (err) 
      callback(err) 
    else 
      callback(err, pgResult.rows[0].data, pgResult.rows[0].etag)
  });
}

function createPermissionsThen(req, permissions, scopes, callback) {
  var subject = permissions._subject;
  var newEtag = lib.uuid4()
  var query = 'INSERT INTO permissions (subject, etag, data) values($1, $2, $3) RETURNING etag'
  function eventData(pgResult) {
    return {subject: permissions._subject, action: 'create', etag: pgResult.rows[0].etag, scopes: scopes}
  }
  eventProducer.queryAndStoreEvent(req, query, [subject, newEtag, JSON.stringify(permissions)], 'permissions', eventData, function(err, pgResult, pgEventResult) {
    if (err) 
      if (err.code == 23505)
        callback(409)
      else
        callback(err) 
    else 
      callback(err, pgResult.rows[0].etag)
  })
}

function updatePermissionsThen(req, subject, patchedPermissions, scopes, etag, callback) {
  var newEtag = lib.uuid4()
  var key = lib.internalizeURL(subject, req.headers.host);
  var query = 'UPDATE permissions SET (etag, data) = ($1, $2) WHERE subject = $3 AND etag = $4 RETURNING etag'
  var args = [newEtag, JSON.stringify(patchedPermissions), key, etag]
  function eventData(pgResult) {
    return {subject: patchedPermissions._subject, action: 'update', etag: pgResult.rows[0].etag, scopes: scopes}
  }
  eventProducer.queryAndStoreEvent(req, query, args, 'permissions', eventData, function(err, pgResult, pgEventResult) {
    if (err) 
      callback(err) 
    else 
      callback(err, pgResult.rows[0].etag)
  })
}

function putPermissionsThen(req, subject, permissions, scopes, callback) {
  var newEtag = lib.uuid4()
  var key = lib.internalizeURL(subject, req.headers.host);
  var query = 'UPDATE permissions SET (etag, data) = ($1, $2) WHERE subject = $3 RETURNING etag'
  var args = [newEtag, JSON.stringify(permissions), key]
  function eventData(pgResult) {
    return {subject: permissions._subject, action: 'update', etag: pgResult.rows[0].etag, scopes: scopes}
  }
  eventProducer.queryAndStoreEvent(req, query, args, 'permissions', eventData, function(err, pgResult, pgEventResult) {
    if (err) 
      callback(err) 
    else 
      callback(err, pgResult.rows[0].etag)
  })
}

function withResourcesSharedWithActorsDo(req, actors, callback) {
  actors = actors == null ? [INCOGNITO] : actors.concat([INCOGNITO, ANYONE]);
  const delim = generateDelimiter()
  var query = `SELECT DISTINCT subject FROM permissions WHERE data#>'{_metadata, sharedWith}' ?| array[${actors.map(x => `$${delim}$${x}$${delim}$`).join(',')}]`
  console.log(query)
  console.log(query)
  pool.query(query, function (err, pgResult) {
    if (err) 
      callback(err) 
    else 
      callback(err, pgResult.rows.map(row => row.subject))
  });
}

function withHeirsDo(req, securedObject, callback) {
  var query, args
  if (Array.isArray(securedObject)) {
    const delim = generateDelimiter()
    query = `SELECT DISTINCT subject, data FROM permissions WHERE data->'_inheritsPermissionsOf' ?| array[${actors.map(x => `$${delim}$${x}$${delim}$`).join(',')}]`
  } else {
    query = "SELECT subject, data FROM permissions WHERE data->'_inheritsPermissionsOf' ? $1"
    args = [securedObject]
  }
  pool.query(query, args, function (err, pgResult) {
    if (err) 
      callback(err) 
    else 
      callback(null, pgResult.rows.map(row => row.data._subject))
  })
}

function init(callback, aPool) {
  pool = aPool || new Pool(config)
  eventProducer = new pge.eventProducer(pool)
  var query = 'CREATE TABLE IF NOT EXISTS permissions (subject text primary key, etag text, data jsonb);'
  pool.connect(function(err, client, release) {
    if(err)
      console.error('error creating permissions table', err)
    else
      client.query(query, function(err, pgResult) {
        if(err) {
          release()
          console.error('error creating permissions table', err)
        } else {
          query = "CREATE INDEX IF NOT EXISTS inxinherits ON permissions USING gin ((data->'_inheritsPermissionsOf'));"
          client.query(query, function(err, pgResult) {
            if(err) {
              release()
              console.error('error creating inxinherits index', err)
            } else {
              query = "CREATE INDEX IF NOT EXISTS inxsharedwith ON permissions USING gin ((data->'_metadata'->'sharedWith'));"
              client.query(query, function(err, pgResult) {
                if(err) {
                  release()
                  console.error('error creating inxsharedwith index', err)
                } else {
                  release()
                  console.log('permissions-maintenance-db: connected to PG, config: ', config)
                  eventProducer.init(callback)
                }
              })
            }
          })
        }
      })
  })    
}

exports.withPermissionsDo = withPermissionsDo
exports.createPermissionsThen = createPermissionsThen
exports.deletePermissionsThen = deletePermissionsThen
exports.updatePermissionsThen = updatePermissionsThen
exports.putPermissionsThen = putPermissionsThen
exports.withResourcesSharedWithActorsDo = withResourcesSharedWithActorsDo
exports.withHeirsDo = withHeirsDo
exports.init = init