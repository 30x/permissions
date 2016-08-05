'use strict';
var Pool = require('pg').Pool;
var lib = require('./standard-functions.js');

var config = {
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
};

var pool = new Pool(config);

function withPermissionsDo(req, res, subject, callback) {
  // fetch the permissions resource for `subject`.
  subject = lib.internalizeURL(subject, req.headers.host);
  var query = 'SELECT etag, data FROM permissions WHERE subject = $1';
  pool.query(query,[subject], function (err, pgResult) {
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

function registerCache(ipaddress) {
  var time = Date.now();
  var query = 'INSERT INTO caches (ipaddress, registrationtime) values ($1, $2) ON CONFLICT (ipaddress) DO UPDATE SET registrationtime = EXCLUDED.registrationtime'
  pool.query(query, [ipaddress, time], function (err, pgResult) {
    if (err) {
      console.log(`unable to register ipaddress ${ipaddress} ${err}`);
    } else {
      console.log(`registered cache ${ipaddress} at time ${time}`)
    }
  });
}

function withEventsAfter(index, callback) {
  var query = 'SELECT * FROM events WHERE index > $1';
  pool.query(query, [index], function(err, pgResult) {
    if (err) {
      console.log(`unable to retrieve events subsequent to ${index} ${err}`);      
    } else{
      console.log(`retrieved events subsequent to ${index}`);      
      callback(pgResult.rows);
    }
  });
}

function withLastEventID(callback) {
  var query = 'SELECT last_value FROM events_index_seq'
  pool.query(query, function(err, pgResult) {
    if(err) {
      console.log('error retrieving last event ID', err);
      callback(err);
    } else {
      console.log('retrieved last event ID', pgResult.rows[0].last_value);
      callback(null, pgResult.rows[0].last_value);
    }
  });
}

function createTablesThen(callback) {
  var query = 'CREATE TABLE IF NOT EXISTS permissions (subject text primary key, etag serial, data jsonb);'
  pool.query(query, function(err, pgResult) {
    if(err) {
      console.error('error creating permissions table', err);
    } else {
      query = 'CREATE TABLE IF NOT EXISTS events (index bigserial, topic text, eventtime bigint, data jsonb)';
      pool.query(query, function(err, pgResult) {
        if(err) {
          console.error('error creating events table', err);
        } else {
          query = 'CREATE TABLE IF NOT EXISTS caches (ipaddress text primary key, registrationtime bigint)';
          pool.query(query, function(err, pgResult) {
            if(err) {
              console.error('error creating caches table', err);
            } else {
              callback()
            }
          });
        }
      });
    }
  });    
}

exports.withPermissionsDo = withPermissionsDo;
exports.createTablesThen = createTablesThen;
exports.registerCache = registerCache;
exports.withEventsAfter = withEventsAfter;
exports.withLastEventID = withLastEventID;