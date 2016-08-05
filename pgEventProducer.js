'use strict';
var Pool = require('pg').Pool;
var lib = require('./standard-functions.js');

var SPEEDUP = process.env.SPEEDUP || 1;
var ONEMINUTE = 60*1000/SPEEDUP;
var TWOMINUTES = 2*60*1000/SPEEDUP;
var TENMINUTES = 10*60*1000/SPEEDUP;
var ONEHOUR = 60*60*1000/SPEEDUP;

function eventProducer(pool) {
  this.pool = pool;
  this.consumers = [];
}

eventProducer.prototype.init = function() {
  var self = this;
  this.createTablesThen(function () {
    setInterval(self.getCaches, ONEMINUTE, self);
    setInterval(self.discardCachesOlderThan, TWOMINUTES, TENMINUTES, self);
    setInterval(self.discardEventsOlderThan, TENMINUTES, ONEHOUR, self);
  });  
}

eventProducer.prototype.discardCachesOlderThan = function(interval, self) {
  var time = Date.now() - interval;
  var pool = self.pool;
  pool.query(`DELETE FROM caches WHERE registrationtime < ${time}`, function (err, pgResult) {
    if (err) {
      console.log('discardCachesOlderThan:', `unable to delete old caches ${err}`);
    } else {
      console.log('discardCachesOlderThan:', `trimmed caches older than ${time}`)
    }
  });
}

eventProducer.prototype.getCaches = function(self) {
  var query = 'SELECT ipaddress FROM caches';
  var pool = self.pool;
  pool.query(query, function (err, pgResult) {
    if (err) {
      console.log(`unable to retrieve ipaddresses from caches`);
    } else {
      self.setConsumers(pgResult.rows.map(row => row.ipaddress));
    }
  });
}

eventProducer.prototype.discardEventsOlderThan = function(interval, self) {
  var time = Date.now() - interval;
  var pool = self.pool;
  pool.query(`DELETE FROM events WHERE eventtime < ${time}`, function (err, pgResult) {
    if (err) {
      console.log('discardEventsOlderThan:', `unable to delete old events ${err}`);
    } else {
      console.log('discardEventsOlderThan:', time);
    }
  });
}

eventProducer.prototype.createTablesThen = function(callback) {
  var query = 'CREATE TABLE IF NOT EXISTS events (index bigserial, topic text, eventtime bigint, data jsonb)';
  var pool = this.pool;
  pool.query(query, function(err, pgResult) {
    if(err) {
      console.error('error creating events table', err);
    } else {
      query = 'CREATE TABLE IF NOT EXISTS caches (ipaddress text primary key, registrationtime bigint)';
      pool.query(query, function(err, pgResult) {
        if(err) {
          console.error('error creating caches table', err);
        } else {
          callback();
        }
      });
    }
  });
}

eventProducer.prototype.setConsumers = function(peers) {
  console.log('setConsumers:', 'peers:', peers)
  this.consumers = peers;
}

eventProducer.prototype.tellConsumers = function(req, event) {
  for (var i = 0; i < this.consumers.length; i++) {
    var cache = consumers[i];
    lib.sendEventThen(req, event, cache, function(err) {
    if (err) {
      console.log(`failed to send event to ${cache}`);
    }
    });
  }
}

exports.eventProducer=eventProducer;