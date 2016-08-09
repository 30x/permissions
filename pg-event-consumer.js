'use strict';
var lib = require('http-helper-functions');

var SPEEDUP = process.env.SPEEDUP || 1;
var ONEMINUTE = 60*1000/SPEEDUP;
var TWOMINUTES = 2*60*1000/SPEEDUP;
var TENMINUTES = 10*60*1000/SPEEDUP;
var ONEHOUR = 60*60*1000/SPEEDUP;

function eventConsumer(pool, ipaddress, clientCallback) {
  this.pool = pool; 
  this.ipaddress=ipaddress;
  this.clientCallback = clientCallback;
}

eventConsumer.prototype.registerConsumer = function(self) {
  var time = Date.now();
  var query = 'INSERT INTO consumers (ipaddress, registrationtime) values ($1, $2) ON CONFLICT (ipaddress) DO UPDATE SET registrationtime = EXCLUDED.registrationtime'
  self.pool.query(query, [self.ipaddress, time], function (err, pgResult) {
    if (err) {
      console.log(`unable to register ipaddress ${self.ipaddress} ${err}`);
    } else {
      console.log(`registered cache ${self.ipaddress} at time ${time}`)
    }
  });
}

eventConsumer.prototype.withEventsAfter = function(index, callback) {
  var query = 'SELECT * FROM events WHERE index > $1';
  this.pool.query(query, [index], function(err, pgResult) {
    if (err) {
      console.log(`unable to retrieve events subsequent to ${index} ${err}`);      
    } else{
      console.log(`retrieved events subsequent to ${index}`);      
      callback(pgResult.rows);
    }
  });
}

eventConsumer.prototype.withLastEventID = function(callback) {
  var query = 'SELECT last_value FROM events_index_seq'
  this.pool.query(query, function(err, pgResult) {
    if(err) {
      console.log('error retrieving last event ID', err);
      callback(err);
    } else {
      console.log('retrieved last event ID', pgResult.rows[0].last_value);
      callback(null, parseInt(pgResult.rows[0].last_value));
    }
  });
}

eventConsumer.prototype.createTablesThen = function(callback) {
  var self = this;
  var query = 'CREATE TABLE IF NOT EXISTS events (index bigserial, topic text, eventtime bigint, data jsonb)';
  self.pool.query(query, function(err, pgResult) {
  if(err) {
    console.error('error creating events table', err);
  } else {
    query = 'CREATE TABLE IF NOT EXISTS consumers (ipaddress text primary key, registrationtime bigint)';
    self.pool.query(query, function(err, pgResult) {
      if(err) {
        console.error('error creating consumers table', err);
      } else {
        callback()
      }
    });
    }
  });    
}

eventConsumer.prototype.processEvent = function(event) {
  console.log(`eventConsumer.processEvent: index: ${event.index} subject: ${event.data.subject}`);
  this.processedEvents.setEventMark(event.index);
  this.clientCallback(event); 
}

eventConsumer.prototype.processStoredEvents = function(events) {
  for (var i=0; i< events.length; i++) {
    var event = events[i];    
    console.log('processStoredEvent:', 'event:', event.index);
    this.processedEvents.setEventMark(parseInt(event.index));
  }
  this.processedEvents.disposeOldEvents();
}

eventConsumer.prototype.fetchStoredEvents = function(self) {
  self.processedEvents.disposeOldEvents();
  self.withEventsAfter(self.processedEvents.lastEventIndex, function(events){self.processStoredEvents(events)});
}

eventConsumer.prototype.init = function(callback) {
  var self = this;
  self.createTablesThen(function(){
    self.withLastEventID(function(err, id) {
      if (err) {
        console.log('unable to get last value of event ID')
      } else {
        self.processedEvents = new BitArray(id, 1000);
        self.registerConsumer(self);
        setInterval(self.registerConsumer, ONEMINUTE, self);
        setInterval(self.fetchStoredEvents, TWOMINUTES, self);
        callback();
      }
    });  
  });
}

function BitArray(initialIndex, size) {
  console.log(`initialIndex ${initialIndex}`)
  this.processedEvents = new Uint16Array(size || 1000);      
  this.lastEventIndex = initialIndex-1;      // database index of last processed event. This is the database index of the (firstEventOffset - 1) entry in processedEvents
  this.highestEventIndex = initialIndex-1;   // highest database index of event processed.
  this.firstEventOffset = 0;                 // offset in processedEvents of lastEventIndex    
}

BitArray.prototype.disposeOldEvents = function() {
  var index = this.lastEventIndex + 1;
  var handled = 0;
  while (this.readEventMark(index+handled)) {handled++;}
  console.log(`disposing of ${handled} events. highestEventIndex: ${this.highestEventIndex} lastEventIndex: ${this.lastEventIndex} firstEventOffset: ${this.firstEventOffset}`)
  var newFirstEventOffset = this.firstEventOffset + handled;
  if ((newFirstEventOffset + 1) / 16 > 1) { // shift entries left
    var firstEntry = this.entryIndex(newFirstEventOffset);
    var lastEntry = this.entryIndex(this.highestEventIndex);
    var numberOfEntries = lastEntry - firstEntry + 1;
    console.log(`copying left: firstEntry ${firstEntry} lastEntry: ${lastEntry} numberOfEntries: ${numberOfEntries}`)
    this.processedEvents.copyWithin(0, firstEntry, lastEntry+1);
    for (var i = numberOfEntries; i <= lastEntry; i++) {
      this.processedEvents[i] = 0;
    }
    this.firstEventOffset = newFirstEventOffset % 16;
  } else {
    this.firstEventOffset = newFirstEventOffset;
  }
  this.lastEventIndex += handled;
}

BitArray.prototype.bitIndex = function(index) {
  return (index - this.lastEventIndex - 1 + this.firstEventOffset) % 16;
}

BitArray.prototype.entryIndex = function(index) {
  return Math.floor((index - this.lastEventIndex - 1 + this.firstEventOffset) / 16);
}

BitArray.prototype.readEventMark = function(index) {
  var bitInx = this.bitIndex(index);
  var entryInx = this.entryIndex(index);
  var entry = this.processedEvents[entryInx];
  return (entry >> bitInx) & 1 ? true : false
}

BitArray.prototype.setEventMark = function(index) {
  var bitInx = this.bitIndex(index);
  var entryInx = this.entryIndex(index);
  var entry = this.processedEvents[entryInx];
  entry = entry | (1 << bitInx);
  this.processedEvents[entryInx] = entry;  
  this.highestEventIndex = Math.max(this.highestEventIndex, index);
}

exports.eventConsumer = eventConsumer;