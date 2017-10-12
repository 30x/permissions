'use strict'
var Pool = require('pg').Pool
var lib = require('@apigee/http-helper-functions')
const rLib = require('@apigee/response-helper-functions')
const MAX_ENTITY_SIZE = 1e4
var DIRECTORY = '/dir-dir-'
var ENTRY = '/nym-entry-'

var config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
}

var pool

const randomBytes = require('crypto').randomBytes
const letters16 = 'abcdefghijklmnopqrst'
function generateDelimiter() {
  var buf = randomBytes(4), rslt = ''
  for (var i = 0; i < 4; i++) {
    rslt += letters16[buf[i] >>> 4]
    rslt += letters16[buf[i] & 0xf]
  }
  return rslt
}

function createDirectoryThen(res, id, directory, callback) {
  directory.etag = rLib.uuid4()
  var query = 'INSERT INTO directory (id, data) values($1, $2)'
  pool.query(query, [id, JSON.stringify(directory)], (err, pgResult) => {
    if (err)
      rLib.internalError(res, {msg: 'unable to create directory in database', err: err})
    else {
      if (pgResult.rowCount === 0) 
        callback(404)
      else {
        var row = pgResult.rows[0];
        callback(directory.etag)
      }
    }
  })
}

function withDirectoryDo(res, id, callback) {
  pool.query('SELECT data FROM directory WHERE id = $1', [id], (err, pgRes) => {
    if (err) {
      rLib.internalError(res, {msg: 'unable to read from database', err: err})
    }
    else {
      if (pgRes.rowCount === 0) { 
        callback()
      }
      else {
        var row = pgRes.rows[0]
        callback(row.data)
      }
    }
  })
}

function deleteDirectoryThen(res, id, callback) {
  var query = 'DELETE FROM directory WHERE id = $1 RETURNING *'
  pool.query(query, [id], (err, pgResult) => {
    if (err)
      rLib.internalError(res, {msg: 'unable to delete from database', err: err})
    else {
      if (pgResult.rowCount === 0) 
        callback()
      else {
        var row = pgResult.rows[0];
        callback(pgResult.rows[0].data)
      }
    }
  })
}

function updateDirectoryThen(res, id, directory, etag, callback) {
  var query = "UPDATE directory SET (data) = ($1) WHERE id = $2 AND data->>'etag' = $3"
  directory.etag = rLib.uuid4()
  var args = [JSON.stringify(directory), id, etag]
  if (args[0].length > MAX_ENTITY_SIZE)
    rLib.badRequest(res, {msg: `size of directory with patch my not exceed ${MAX_ENTITY_SIZE}`})
  else
    pool.query(query, args, (err, pgResult) => {
      if (err)
        rLib.internalError(res, {msg: 'unable to update in database', err: err})
      else {
        if (pgResult.rowCount === 0) 
          callback()
        else 
          callback(directory.etag)
      }
    })
}

function init(callback, aPool) {
  pool = aPool || new Pool(config)
  pool.connect((err, client, release) => {
    if(err) {
      console.error('error creating teams table', err)
      process.exit(1)
    } else
      client.query("CREATE TABLE IF NOT EXISTS directory (id text primary key, data jsonb)", (err, pgResult) => {
        if (err && err.code != 23505) {
          release()
          console.error('error creating directory table', err)
          process.exit(1)
        } else 
          client.query("CREATE INDEX IF NOT EXISTS directory_data_inx ON directory USING gin (data)", (err, pgResult) => {
            if(err && err.code != 23505) {
              release()
              console.error('error creating directory_data_inx index on directory table', err)
              process.exit(1)
            } else {
              release()
              callback()
            }
          })
      })
  })
}

process.on('unhandledRejection', e => {
  console.log(e.message, e.stack)
})

exports.createDirectoryThen = createDirectoryThen
exports.updateDirectoryThen = updateDirectoryThen
exports.deleteDirectoryThen = deleteDirectoryThen
exports.withDirectoryDo = withDirectoryDo
exports.init = init