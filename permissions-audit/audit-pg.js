'use strict'
var Pool = require('pg').Pool
var pge = require('pg-event-producer')

var AUDITS = '/audits/'

var config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
}

var pool

function withAuditEventsForScopeDo(res, scope, callback) {
  var query = `SELECT * FROM events WHERE data->'scopes' ? $1`
  pool.query(query, [scope], function (err, pg_res) {
    if (err)
      rLib.internalError(res, {msg: `database error: ${JSON.stringify(err)}`, err: err})
    else 
      callback(pg_res.rows)
  })
}

function init(callback, aPool) {
  pool = aPool || new Pool(config)
  var eventProducer = new pge.eventProducer(pool)
  eventProducer.createTablesThen(callback)
}

process.on('unhandledRejection', function(e) {
  console.log(e.message, e.stack)
})

exports.withAuditEventsForScopeDo = withAuditEventsForScopeDo
exports.init = init