'use strict'
var Pool = require('pg').Pool
var lib = require('@apigee/http-helper-functions')
const rLib = require('@apigee/response-helper-functions')
const MAX_ENTITY_SIZE = 1e4
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

function createEntryThen(res, id, entry, callback) {
  entry.etag = rLib.uuid4()
  var query = 'INSERT INTO entry (id, data) values($1, $2)'
  pool.query(query, [id, JSON.stringify(entry)], (err, pgResult) => {
    if (err)
      if (err.code == 23505)
        rLib.duplicate(res, {msg: 'duplicate entry', name: entry.name, namespace: entry.namespace})
      else
        rLib.internalError(res, {msg: 'unable to create in database', err: err})
    else {
      if (pgResult.rowCount === 0) 
        callback(404)
      else {
        var row = pgResult.rows[0];
        callback(entry.etag)
      }
    }
  })
}

function withEntryDo(res, id, callback) {
  pool.query(`SELECT data FROM entry WHERE id = $1`, [id], (err, pgRes) => {
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

function withEntryByPathDo(res, path, callback) {
  /*
  For a path of the form a/b/c/d, construct a query of the form:

  SELECT entry_3.data->>'namedResource' 
  FROM  entry AS entry_3, entry AS entry_2, entry AS entry_1, entry AS entry_0 
  WHERE
          entry_3.data->>'name' = 'd'
      AND entry_2.data->>'name' = 'c'
      AND entry_1.data->>'name' = 'b'
      AND entry_0.data->>'name' = 'a'
      AND entry_3.data->>'namespace' = entry_2.data->>'namedResource'
      AND entry_2.data->>'namespace' = entry_1.data->>'namedResource'
      AND entry_1.data->>'namespace' = entry_0.data->>'namedResource'
      AND entry_0.data->>'namespace' = '/'
  */
  var parts = path.split('/')
  if (parts.length > 10)
    rLib.badRequest(res, {msg: `no more than 10 levels of nesting of directories allowed`, path: path})
  else {
    if (parts[0] == '') {
      parts = parts.slice(1, parts.length)
      var delim = generateDelimiter()
      var tables = parts.map((_, inx) => `entry as entry_${inx}`)
      var whereClauses = parts.map((part, inx) => `entry_${inx}.data->>'namespace' = ${inx > 0 ? `entry_${inx-1}.data->>'namedResource'` : "'/'"} AND
        entry_${inx}.data->>'name' = $${delim}$${parts[inx]}$${delim}$`)
      var query = `SELECT entry_${parts.length-1}.id, entry_${parts.length-1}.data FROM ${tables.join(', ')} WHERE ${whereClauses.join(' AND ')}`
      pool.query(query, (err, pgRes) => {
        if (err)
          rLib.internalError(res, {msg: 'unable to read from database', err: err})
        else
          if (pgRes.rowCount === 0)
            rLib.notFound(res, {msg: 'unable to find entry by path', path: path})
          else
            callback(pgRes.rows[0].id, pgRes.rows[0].data)
      })
    } else
      rLib.badRequest(res, {msg: `only paths starting with / are supported`, path: path})    
  }
}

function withEntriesForNamedResourceDo(res, namedResource, callback) {
  let query = `select id, data from entry where data->>'namedResource' = $1`
  pool.query(query, [namedResource], (err, pgRes) => {
    if (err)
      rLib.internalError(res, {msg: 'unable to read from database', err: err})
    else
      if (pgRes.rowCount === 0)
        rLib.notFound(res, {msg: 'unable to find entry for given namedResource', namedResource: namedResource})
      else {
        let rslt = []
        for (let row of pgRes.rows) {
          row.data.self = row.id
          rslt.push(row.data)
        }
        callback(rslt)
      }
    })
}

function deleteEntriesForNamedResourceThen(res, namedResource, callback) {
  let query = `delete from entry where data->>'namedResource' = $1 returning id, data`
  pool.query(query, [namedResource], (err, pgRes) => {
    if (err)
      rLib.internalError(res, {msg: 'unable to delete entries from database for given namedResource', namedResource: namedResource, err: err})
    else
      if (pgRes.rowCount === 0)
        rLib.notFound(res, {msg: 'unable to delete entries for given namedResource', namedResource: namedResource})
      else {
        let rslt = []
        for (let row of pgRes.rows) {
          row.data.self = row.id
          rslt.push(row.data)
        }
        callback(rslt)
      }
    })
}

function deleteEntryThen(res, id, callback) {
  var query = 'DELETE FROM entry WHERE id = $1 RETURNING *'
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

function updateEntryThen(res, id, entry, etag, callback) {
  var query = "UPDATE entry SET (data) = ($1) WHERE id = $2 AND data->>'etag' = $3"
  entry.etag = rLib.uuid4()
  var args = [JSON.stringify(entry), id, etag]
  if (args[0].length > MAX_ENTITY_SIZE)
    rLib.badRequest(res, {msg: `size of entry with patch my not exceed ${MAX_ENTITY_SIZE}`})
  else
    pool.query(query, args, (err, pgResult) => {
      if (err)
        rLib.internalError(res, {msg: 'unable to update in database', err: err})
      else {
        if (pgResult.rowCount === 0) 
          callback()
        else 
          callback(entry.etag)
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
      client.query("CREATE TABLE IF NOT EXISTS entry (id text primary key, data jsonb)", (err, pgResult) => {
        if(err && err.code != 23505) {
          release()
          console.error('error creating entry table', err)
          process.exit(1)
        } else
          client.query("CREATE INDEX IF NOT EXISTS entry_data_inx ON entry USING gin (data)", (err, pgResult) => {
            if (err && err.code != 23505) {
              release()
              console.error('error creating entry_data_inx index on entry table', err)
              process.exit(1)
            } else
              client.query("CREATE UNIQUE INDEX IF NOT EXISTS entry_unique_name_inx ON entry ((data->>'name'), (data->>'namespace'))", (err, pgResult) => {
                if (err && err.code != 23505) {
                  release()
                  console.error('error creating entry_unique_name_inx index on entry table', err)
                  process.exit(1)
                } else {
                  release()
                  callback()
                }
              })
          })
      })
  })
}

process.on('unhandledRejection', e => {
  console.log(e.message, e.stack)
})

exports.createEntryThen = createEntryThen
exports.updateEntryThen = updateEntryThen
exports.deleteEntryThen = deleteEntryThen
exports.withEntryDo = withEntryDo
exports.withEntryByPathDo = withEntryByPathDo
exports.withEntriesForNamedResourceDo = withEntriesForNamedResourceDo
exports.deleteEntriesForNamedResourceThen = deleteEntriesForNamedResourceThen
exports.init = init