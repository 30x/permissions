'use strict';
var Pool = require('pg').Pool;
var pge = require('pg-event-producer');

var config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
};

var pool = new Pool(config);
var eventProducer = new pge.eventProducer(pool);

function dropTableThen(eventTopic, table, callback) {
  var query = `DROP TABLE IF EXISTS ${table}`;
  function eventData(pgResult) {
    return {subject: null, action: 'deleteAll'}
  }
  pge.queryAndStoreEvent({headers:{}}, null, pool, query, eventTopic, eventData, eventProducer, function(pgResult, pgEventResult) {
    callback();
  });
}

eventProducer.init(function(){
  dropTableThen('permissions', 'permissions', function(err, pg_res) {
    if(err) console.error('error dropping permissions table', err);
    else console.log(`dropped table permissions ${process.env.PG_HOST}`)
    dropTableThen('teams', 'teams', function(err, pg_res) {
      if(err) console.error('error dropping teams table', err);
      else console.log(`dropped table teams ${process.env.PG_HOST}`)
      pool.end()
      eventProducer.finalize();
    });
  });
});
