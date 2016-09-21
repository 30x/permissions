'use strict';
var Pool = require('pg').Pool;
var lib = require('http-helper-functions');

var config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
};

var pool = new Pool(config);

function withPermissionsDo(req, res, subject, callback) {
  // fetch the permissions resource for `subject`.
  subject = lib.internalizeURL(subject, req.headers.host);
  var query = `SELECT etag, data FROM permissions WHERE subject = '${subject}'`;
  //console.log(`permissions-db:withPermissionsDo: query: ${query}`)
  pool.query(query, function (err, pgResult) {
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

function init(callback) {
  var query = 'CREATE TABLE IF NOT EXISTS permissions (subject text primary key, etag int, data jsonb);'
  pool.query(query, function(err, pgResult) {
    if(err) {
      console.error('error creating permissions table', err);
    } else {
      console.log('permissions-db: connected to PG: ', config);
      callback();
    }
  });    
}

exports.withPermissionsDo = withPermissionsDo;
exports.init = init;
exports.pool = pool;