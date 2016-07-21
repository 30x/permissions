'use strict';
var Pool = require('pg').Pool;

var config = {
  host: 'localhost',
  user: 'martinnally',
  password: 'martinnally',
  database: 'permissions',
};

process.on('unhandledRejection', function(e) {
  console.log(e.message, e.stack)
})

var pool = new Pool(config)

pool.query('DROP TABLE IF EXISTS permissions', function(err, pg_res) {
  if(err) console.error('error dropping permissions table', err);
  else console.log('dropped table permissions')
  pool.end()
});

pool.query('DROP TABLE IF EXISTS teams', function(err, pg_res) {
  if(err) console.error('error dropping teams table', err);
  else console.log('dropped table teams')
  pool.end()
})