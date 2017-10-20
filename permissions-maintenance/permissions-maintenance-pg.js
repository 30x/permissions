'use strict';
const Pool = require('pg').Pool;
const lib = require('@apigee/http-helper-functions');
const rLib = require('@apigee/response-helper-functions');
const pge = require('@apigee/pg-event-producer');
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

function withPermissionsDo(res, subject, callback) {
  const query = 'SELECT etag, data FROM permissions WHERE subject = $1'
  pool.query(query,[subject], function (err, pgResult) {
    if (err)
      rLib.internalError(res, {msg: 'unable to query permissions table', err: err, subject: subject})
    else {
      if (pgResult.rowCount === 0) 
        rLib.notFound(res, {msg: 'permissions not found for subject', subject: subject})
      else {
        var row = pgResult.rows[0];
        callback(row.data, row.etag)
      }
    }
  })
}

function deletePermissionsThen(req, res, subject, callback) {
  let changeEvent = {
    subject: subject, 
    action: 'delete'
  }
  eventProducer.deleteResourceThen(req, res, subject, 'permissions', changeEvent, (deletedRecord) => 
    callback(deletedRecord.data, deletedRecord.etag)
  )
}

function createPermissionsThen(req, errorHandler, permissions, scopes, callback) {
  let changeEvent = {
    subject: permissions._subject, 
    action: 'create',
    resource: permissions,
    scopes: scopes
  }
  eventProducer.createResourceThen(req, errorHandler, permissions._subject, permissions, 'permissions', changeEvent, (resourceRecord, eventRecord) => {
    callback(permissions.etag)
  })
}

function updatePermissionsThen(req, errorHandler, subject, priorPermissions, patchedPermissions, scopes, ifMatch, callback) {
  let changeEvent = {
    subject: patchedPermissions._subject, 
    action: 'update',
    resource: patchedPermissions,
    scopes: scopes
  }
  eventProducer.updateResourceThen(req, errorHandler, subject, patchedPermissions, ifMatch, priorPermissions, 'permissions', changeEvent, (eventRecord) => {
    callback(patchedPermissions.etag)
  })
}

function withResourcesSharedWithActorsDo(res, actors, callback) {
  actors = actors == null ? [INCOGNITO] : actors.concat([INCOGNITO, ANYONE]);
  const delim = generateDelimiter()
  var query = `SELECT DISTINCT subject FROM permissions WHERE data#>'{_metadata, sharedWith}' ?| array[${actors.map(x => `$${delim}$${x}$${delim}$`).join(',')}]`
  pool.query(query, function (err, pgResult) {
    if (err) 
    rLib.internalError(res, {msg:'unable to query permissions table', err: err}) 
    else 
      callback(pgResult.rows.map(row => row.subject))
  });
}

function withHeirsDo(res, securedObject, callback) {
  var query, args
  if (Array.isArray(securedObject)) {
    const delim = generateDelimiter()
    query = `SELECT DISTINCT subject, data FROM permissions WHERE data->'_inheritsPermissionsOf' ?| array[${securedObject.map(x => `$${delim}$${x}$${delim}$`).join(',')}]`
  } else {
    query = "SELECT subject, data FROM permissions WHERE data->'_inheritsPermissionsOf' ? $1"
    args = [securedObject]
  }
  pool.query(query, args, function (err, pgResult) {
    if (err) 
      rLib.internalError(res, {msg:'unable to query permissions table', err: err, securedObject: securedObject}) 
    else 
      callback(pgResult.rows.map(row => row.data._subject))
  })
}

function init(callback, aPool) {
  pool = aPool || new Pool(config)
  eventProducer = new pge.eventProducer(pool, 'permissions', 'subject')
  var query = 'CREATE TABLE IF NOT EXISTS permissions (subject text primary key, etag text, data jsonb);'
  pool.connect(function(err, client, release) {
    if(err) {
      console.error('error creating permissions table', err)
      process.exit(1)
    } else
      client.query(query, function(err, pgResult) {
        if(err && err.code != 23505) {
          release()
          console.error('error creating permissions table', err)
          process.exit(1)
        } else {
          query = "CREATE INDEX IF NOT EXISTS inxinherits ON permissions USING gin ((data->'_inheritsPermissionsOf'));"
          client.query(query, function(err, pgResult) {
            if(err && err.code != 23505) {
              release()
              console.error('error creating inxinherits index', err)
              process.exit(1)
            } else {
              query = "CREATE INDEX IF NOT EXISTS inxsharedwith ON permissions USING gin ((data->'_metadata'->'sharedWith'));"
              client.query(query, function(err, pgResult) {
                if(err && err.code != 23505) {
                  release()
                  console.error('error creating inxsharedwith index', err)
                  process.exit(1)
                } else {
                  release()
                  console.log('permissions-maintenance-db: connected to PG')
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
exports.withResourcesSharedWithActorsDo = withResourcesSharedWithActorsDo
exports.withHeirsDo = withHeirsDo
exports.init = init