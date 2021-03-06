'use strict'
var Pool = require('pg').Pool
var lib = require('@apigee/http-helper-functions')
const ANYONE = 'http://apigee.com/users#anyone'

var config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
}

var pool = new Pool(config)

function log(method, text) {
  console.log(Date.now(), process.env.COMPONENT_NAME, method, text)
}

function withPermissionsDo(req, subject, callback) {
  var hrstart = process.hrtime()
  // fetch the permissions resource for `subject`.
  subject = lib.internalizeURL(subject, req.headers.host)
  var query = `SELECT etag, data FROM permissions WHERE subject = $1`
  //console.log(`permissions-db:withPermissionsDo: query: ${query}`)
  pool.query(query, [subject], function (err, pgResult) {
    if (err) 
      callback(err)
    else
      if (pgResult.rowCount === 0)
        callback(404)
      else {
        var row = pgResult.rows[0]
        callback(null, row.data, row.etag)
      }
    var hrend = process.hrtime(hrstart)
    log('permissions-pg:withPermissionsDo', `subject: ${subject} time: ${hrend[0]}s ${hrend[1]/1000000}ms`)
  })
}

function withTeamDo(req, id, callback) {
  pool.query('SELECT etag, data FROM teams WHERE id = $1', [id], function (err, pg_res) {
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

function withTeamsForUserDo(req, user, callback) {
  var query = `SELECT id, etag, data FROM teams WHERE data->'members' ? $1`
  pool.query(query, [user], function (err, pg_res) {
    if (err) {
      callback(err)
    }
    else {
      callback(null, pg_res.rows)
    }
  })
}

function init(callback) {
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
          console.log('permissions-db: connected to PG. host:" ', config.host, ' database: ', config.database)
          var permissions = {
            "_subject": "/",
            "_permissionsHeirs": {
              "add": [ANYONE]
              },
            "az-permissions":  {"create": [ANYONE]}, 
            "az-teams":        {"read": [ANYONE], "create": [ANYONE]}, 
            "_self":        {"read": [ANYONE], "update": [ANYONE], "admin": [ANYONE], "govern": [ANYONE]}
          }
          query = `INSERT INTO permissions (subject, etag, data) values($1, 1, $2) RETURNING etag`
          client.query(query, [permissions._subject, JSON.stringify(permissions)], function(err, pgResult) {
            release()
            if(err)
              if (err.code == 23505) {
                callback()
                console.log('permissions for "/" already existed')
              } else {
                console.error('error creating permissions for "/"', err)
                process.exit(1)
              }
            else
              callback()
          })
        }
      })    
  })
}

exports.withPermissionsDo = withPermissionsDo
exports.withTeamsForUserDo = withTeamsForUserDo
exports.init = init
exports.pool = pool