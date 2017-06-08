'use strict'
var Pool = require('pg').Pool
var lib = require('http-helper-functions')

var config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
}

var pool

function createFolderThen(id, folder, callback) {
  var query = `INSERT INTO folders (id, etag, data) values($1, 1, $2) RETURNING etag`
  pool.query(query, [id, JSON.stringify(folder)], function (err, pgResult) {
    if (err)
      callback(err)
    else {
      if (pgResult.rowCount === 0) 
        callback(404)
      else {
        var row = pgResult.rows[0];
        callback(null, row.etag)
      }
    }
  })
}

function withFolderDo(id, callback) {
  pool.query('SELECT etag, data FROM folders WHERE id = $1', [id], function (err, pg_res) {
    if (err) {
      callback(500)
    }
    else {
      if (pg_res.rowCount === 0) { 
        callback(404)
      }
      else {
        var row = pg_res.rows[0]
        callback(null, row.data, row.etag)
      }
    }
  })
}

function deleteFolderThen(id, callback) {
  var query = `DELETE FROM folders WHERE id = $1 RETURNING *`
  pool.query(query, [id], function (err, pgResult) {
    if (err)
      callback(err)
    else {
      if (pgResult.rowCount === 0) 
        callback(404)
      else {
        var row = pgResult.rows[0];
        callback(err, pgResult.rows[0].data, pgResult.rows[0].etag)
      }
    }
  })
}

function updateFolderThen(id, folder, etag, callback) {
  var query = `UPDATE folders SET (etag, data) = ($1, $2) WHERE id = $3 AND etag = $3 RETURNING etag`
  var args = [(etag+1) % 2147483647, JSON.stringify(folder), id, etag]
  pool.query(query, args, function (err, pgResult) {
    if (err)
      callback(err)
    else {
      if (pgResult.rowCount === 0) 
        callback(404)
      else {
        var row = pgResult.rows[0];
        callback(null, row.etag)
      }
    }
  })
}

function init(callback, aPool) {
  pool = aPool || new Pool(config)
  var query = 'CREATE TABLE IF NOT EXISTS folders (id text primary key, etag int, data jsonb)'
  pool.query(query, function(err, pgResult) {
    if(err)
      console.error('error creating folders table', err)
    else {
      console.log(`connected to PG at ${config.host}`)
      callback()
    }
  })    
}

process.on('unhandledRejection', function(e) {
  console.log(e.message, e.stack)
})

exports.createFolderThen = createFolderThen
exports.updateFolderThen = updateFolderThen
exports.deleteFolderThen = deleteFolderThen
exports.withFolderDo = withFolderDo
exports.init = init