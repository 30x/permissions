'use strict';
var Pool = require('pg').Pool;
var pge = require('pg-event-producer');

var config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
};

console.log(`start drop tables: host: ${config.host} user: ${config.user} password: ${config.password} database: ${config.database}`)
var pool = new Pool(config);
var eventProducer = new pge.eventProducer(pool);

function dropTableThen(eventTopic, table, callback) {
  var query = `DELETE FROM ${table} WHERE data @> '{"test-data": true}'`;
  function eventData(pgResult) {
    return {subject: null, action: 'deleteAll'}
  }
  pge.queryAndStoreEvent({headers:{}}, null, pool, query, eventTopic, eventData, eventProducer, function(pgResult, pgEventResult) {
    callback();
  });
}

eventProducer.init(function(){
  dropTableThen('permissions', 'permissions', function(err, pg_res) {
    if(err) console.error('error removing test data from permissions table', err);
    else console.log(`removed all test data from permissions table on ${process.env.PG_HOST}`)
    dropTableThen('teams', 'teams', function(err, pg_res) {
      if(err) console.error('error removing test data from teams table', err);
      else console.log(`removed all test data from teams table on ${process.env.PG_HOST}`)
      pool.end()
      eventProducer.finalize();
    });
  });
});
