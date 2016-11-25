'use strict'
var Pool = require('pg').Pool
var lib = require('http-helper-functions')
const ANYONE = 'http://apigee.com/users#anyone'

var config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
}

var pool = new Pool(config)

function withPermissionsDo(req, subject, callback) {
  // fetch the permissions resource for `subject`.
  subject = lib.internalizeURL(subject, req.headers.host)
  var query = `SELECT etag, data FROM permissions WHERE subject = '${subject}'`
  //console.log(`permissions-db:withPermissionsDo: query: ${query}`)
  pool.query(query, function (err, pgResult) {
    if (err) 
      callback(err)
    else
      if (pgResult.rowCount === 0)
        callback(404)
      else {
        var row = pgResult.rows[0]
        callback(null, row.data, row.etag)
      }
  })
}

function init(callback) {
  var query = 'CREATE TABLE IF NOT EXISTS permissions (subject text primary key, etag int, data jsonb);'
  pool.query(query, function(err, pgResult) {
    if(err)
      console.error('error creating permissions table', err)
    else {
      console.log('permissions-db: connected to PG: ', config)
      var permissions = {
        "_subject": "scheme://authority/", 
        "permissions":  {"read": [ANYONE], "create": [ANYONE]}, 
        "teams":        {"read": [ANYONE], "create": [ANYONE]}, 
        "_permissions": {"read": [ANYONE], "update": [ANYONE]}, 
        "_self":        {"read": [ANYONE], "update": [ANYONE]}
      }
      query = `INSERT INTO permissions (subject, etag, data) values('${permissions._subject}', 1, '${JSON.stringify(permissions)}') RETURNING etag`
      pool.query(query, function(err, pgResult) {
        if(err)
          if (err.code == 23505)
            callback()
          else
            console.error('error creating permissions for "/"', err)
        else 
          callback()
      })
    }
  })    
}

exports.withPermissionsDo = withPermissionsDo
exports.init = init
exports.pool = pool