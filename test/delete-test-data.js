'use strict'
var Pool = require('pg').Pool
var pge = require('@apigee/pg-event-producer')
// When deleting data, we need to provide a client token for the notifiction
// to the permissions runtime. The http-helper-library provides helper functions
// for getting a token.
var lib = require('@apigee/http-helper-functions')
// The response-helper-functions provides a helper function for wrapping
// an error function with the interfce of an HTTP response object
var rLib = require('@apigee/response-helper-functions')

var config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
}

console.log(`start delete test data: host: ${config.host} database: ${config.database}`)
var pool = new Pool(config)
var eventProducer = new pge.eventProducer(pool)

function deleteTestDataThen(eventTopic, table, callback) {
  // The following call wraps an error function in an object with the
  // interface of Node's HTTP response object 
  let errorHandler = rLib.errorHandler((err) => {
    console.log('deleteTestDataThen - error', err)
    process.exit(1)
  })
  lib.withValidClientToken(errorHandler, null, process.env.PERMISSIONS_CLIENTID, process.env.PERMISSIONS_CLIENTSECRET, process.env.AUTH_URL, newToken => {
    var query = `DELETE FROM ${table} WHERE data @> '{"test-data": true}'`
    function eventData(pgResult) {
      return {subject: null, action: 'deleteAll'}
    }
    let req = {
      headers: {
        authorization: `Bearer ${newToken}`
      }
    }
    eventProducer.queryAndStoreEvent(req, query, [], eventTopic, eventData, function(pgResult, pgEventResult) {
      callback()
    })
  })
}

eventProducer.init(function(){
  deleteTestDataThen('permissions', 'permissions', function(err, pg_res) {
    if(err) console.error('error removing test data from permissions table', err)
    else console.log(`removed all test data from permissions table on ${process.env.PG_HOST}`)
    deleteTestDataThen('teams', 'teams', function(err, pg_res) {
      if(err) console.error('error removing test data from teams table', err)
      else console.log(`removed all test data from teams table on ${process.env.PG_HOST}`)
      pool.end()
      // The finalize method gives the eventProducer the opportunity to
      // release any resources (e.g. timers) tht might prevent termination
      eventProducer.finalize()
      // The finalize method gives the http-helper-functions library the 
      // opportunity to release any resources (e.g. timers) tht might prevent 
      // termination
      lib.finalize()
    })
  })
})
