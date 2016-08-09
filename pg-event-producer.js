'use strict';
var lib = require('http-helper-functions');
var http = require('http');

var SPEEDUP = process.env.SPEEDUP || 1;
var ONEMINUTE = 60*1000/SPEEDUP;
var TWOMINUTES = 2*60*1000/SPEEDUP;
var TENMINUTES = 10*60*1000/SPEEDUP;
var ONEHOUR = 60*60*1000/SPEEDUP;

var PROTOCOL = process.env.PROTOCOL || 'http:';

function eventProducer(pool) {
  this.pool = pool;
  this.consumers = [];
}

eventProducer.prototype.init = function(callback) {
  var self = this;
  this.createTablesThen(function () {
    setInterval(self.getCaches, ONEMINUTE, self);
    setInterval(self.discardCachesOlderThan, TWOMINUTES, TENMINUTES, self);
    setInterval(self.discardEventsOlderThan, TENMINUTES, ONEHOUR, self);
    callback();
  });  
}

eventProducer.prototype.discardCachesOlderThan = function(interval, self) {
  var time = Date.now() - interval;
  var pool = self.pool;
  pool.query(`DELETE FROM consumers WHERE registrationtime < ${time}`, function (err, pgResult) {
    if (err) {
      console.log('discardCachesOlderThan:', `unable to delete old consumers ${err}`);
    } else {
      console.log('discardCachesOlderThan:', `trimmed consumers older than ${time}`)
    }
  });
}

eventProducer.prototype.getCaches = function(self) {
  var query = 'SELECT ipaddress FROM consumers';
  var pool = self.pool;
  pool.query(query, function (err, pgResult) {
    if (err) {
      console.log(`unable to retrieve ipaddresses from consumers`);
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
      query = 'CREATE TABLE IF NOT EXISTS consumers (ipaddress text primary key, registrationtime bigint)';
      pool.query(query, function(err, pgResult) {
        if(err) {
          console.error('error creating consumers table', err);
        } else {
          callback();
        }
      });
    }
  });
}

eventProducer.prototype.setConsumers = function(consumers) {
  console.log('setConsumers:', 'consumers:', consumers)
  this.consumers = consumers;
}

eventProducer.prototype.tellConsumers = function(req, event) {
  for (var i = 0; i < this.consumers.length; i++) {
    let cache = this.consumers[i];
    sendEventThen(req, event, cache, function(err) {
      if (err) {
        console.log(`failed to send event to ${cache}`);
      } else {
        console.log(`sent event to ${cache} index: ${event.index}`);
      }
    });
  }
}

function sendEventThen(serverReq, event, host, callback) {
  var postData = JSON.stringify(event);
  var headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
  if (serverReq.headers.authorization) {
    headers.authorization = serverReq.headers.authorization; 
  }
  var hostParts = host.split(':');
  var options = {
    protocol: PROTOCOL,
    hostname: hostParts[0],
    path: '/events',
    method: 'POST',
    headers: headers
  };
  if (hostParts.length > 1) {
    options.port = hostParts[1];
  }
  var client_req = http.request(options, function (client_res) {
    lib.getClientResponseBody(client_res, function(body) {
      if (client_res.statusCode == 200) { 
        callback(null);
      } else {
        callback(`unable to send event to: ${host} statusCode: ${client_res.statusCode}`);
      }
    });
  });
  client_req.on('error', function (err) {
    callback(err);
  });
  client_req.write(postData);
  client_req.end();
}

function queryAndStoreEvent(req, res, pool, query, eventTopic, eventData, eventProducer, callback) {
  // We use a transaction here, since its PG and we can. In fact it would be OK to create the event record first and then do the update.
  // If the update failed we would have created an unnecessary event record, which is not ideal, but probably harmless.
  // The converse—creating an update without an event record—could be harmful.
  pool.connect(function(err, client, release) {
    if (err) { 
      lib.badRequest(res, err);
    } else {
      // console.log('query:', query)
      client.query('BEGIN', function(err) {
        if(err) {
          client.query('ROLLBACK', release);
          lib.internalError(res, err);
        } else {
          client.query(query, function(err, pgResult) {
            if(err) {
              client.query('ROLLBACK', release);
              if (err.code == 23505){
                lib.duplicate(res, err);
              } else { 
                lib.badRequest(res, err);
              }
            } else {
              if (pgResult.rowCount === 0) {
                client.query('ROLLBACK', release);
                lib.internalError(res, 'failed create');
              } else {
                var time = Date.now();
                var equery = `INSERT INTO events (topic, eventtime, data) 
                              values ('${eventTopic}', ${time}, '${JSON.stringify(eventData(pgResult))}')
                              RETURNING *`;
                // console.log('equery:', equery)
                client.query(equery, function(err, pgEventResult) {
                  if(err) {
                    client.query('ROLLBACK', release);
                    lib.internalError(res, err);
                  } else {
                    if (pgEventResult.rowcount == 0) {
                      client.query('ROLLBACK', release);
                      lib.internalError(res, 'unable to create event');
                    } else {
                      client.query('COMMIT', release);
                      callback(pgResult, pgEventResult);
                      eventProducer.tellConsumers(req, pgEventResult.rows[0]);
                    }
                  }
                });
              }
            }
          });
        }
      });
    }
  });
}

exports.queryAndStoreEvent=queryAndStoreEvent;
exports.eventProducer=eventProducer;