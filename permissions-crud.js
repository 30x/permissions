'use strict';
/* 
We dislike prerequisites and avoid them where possible. We especially dislike prereqs that have a 'framework' style; simple libraries are more palatable.
The current code uses pg. Because of Node's callback style, these have a slightly 'frameworky' feel, but it is not practical to avoid these libraries.
Please do not add any framework to this preqs. We do not want express or anything like it. We do not want any sort of "ORM" or similar.
Adding simple library prereqs could be OK if the value they bring is in proportion to the problme being solved.
*/
var Pool = require('pg').Pool;
var lib = require('./standard-functions.js');

var config = {
  host: 'localhost',
  user: 'martinnally',
  password: 'martinnally',
  database: 'permissions'
};

var pool = new Pool(config);

function getPermissionsThen(req, res, subject, callback) {
  // fetch the permissions resource for `subject`.
  subject = lib.internalizeURL(subject, req.headers.host)
  var query = 'SELECT etag, data FROM permissions WHERE subject = $1'
  pool.query(query,[subject], function (err, pg_res) {
    if (err) {
      lib.badRequest(res, err);
    } else {
      if (pg_res.rowCount === 0) { 
        lib.notFound(req, res);
      }
      else {
        var row = pg_res.rows[0];
        if (err) {
          lib.internalError(res, err);
        } else {
          callback(row.data, row.etag);
        }
      }
    }
  });
}

function createPermissionsThen(req, res, permissions, callback) {
  // fetch the permissions resource for `subject`.
  lib.internalizeURLs(permissions, req.headers.host);
  pool.query('INSERT INTO permissions (subject, data) values($1, $2) RETURNING etag', [permissions.governs._self, permissions], function (err, pg_res) {
    if (err) {
      if (err.code == 23505){ 
        lib.duplicate(res, err);
      } else { 
        lib.badRequest(res, err);
      }
    } else {
      var etag = pg_res.rows[0].etag;
      callback(permissions, etag);
    }
  });
}

exports.getPermissionsThen = getPermissionsThen;
exports.createPermissionsThen = createPermissionsThen;