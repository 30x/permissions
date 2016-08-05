'use strict';
var http = require('http');
var lib = require('./standard-functions.js');
var querystring = require('querystring');
var url = require('url');

var PROTOCOL = process.env.PROTOCOL || 'http:';

function cache(resource, resource, etag) {
  resource._Etag = etag;
  CACHE[resource] = resource;
}

function processEvent(req, res, event) {
  console.log('processEvent: peerCaches:', peerCaches, 'selfAuthority:', selfAuthority, 'event:', JSON.stringify(event));
  setEventMark(parseInt(event.index));
  delete CACHE[lib.internalizeURL(event.data.subject)];
  for (var i = 0; i < peerCaches.length; i++) {
    var peerCache = peerCaches[i];
    if (peerCache != selfAuthority) {
      lib.sendEventThen(req, event, peerCache, function(err) {
        if (err) {
          console.log(`failed to send event to ${peerCache}`);
        }
    });
    }
  }
  lib.found(req, res);
}

var CACHE = {};

var SPEEDUP = process.env.SPEEDUP || 1;
var ONEMINUTE = 60*1000/SPEEDUP;
var TWOMINUTES = 2*60*1000/SPEEDUP;
var TENMINUTES = 10*60*1000/SPEEDUP;
var ONEHOUR = 60*60*1000/SPEEDUP;

var peerCaches = [];
var selfAuthority = process.env.IPADDRESS;
if (process.env.PORT) {
  selfAuthority += `:${process.env.PORT}`
}

function setPeerCaches(peers) {
  console.log('setPeerCaches:', 'peers:', peers)
  peerCaches = peers;
}

var ipAddress = process.env.PORT !== undefined ? `${process.env.IPADDRESS}:${process.env.PORT}` : process.env.IPADDRESS

// Begin implementation of time-ordered bit-array. TODO - turn this into a JS 'class' that can be instantiated

var processedEvents = new Uint16Array(1000);      
var lastEventIndex = 0;                           // database index of last processed event. This is the database index of the (firstEventOffset - 1) entry in processedEvents
var highestEventIndex = 0;                        // highest database index of event processed.
var firstEventOffset = 0;                         // offset in processedEvents of lastEventIndex

function disposeOldEvents() {
  var index = lastEventIndex + 1;
  var handled = 0;
  while (readEventMark(index+handled)) {handled++;}
  console.log(`disposing of ${handled} events. highestEventIndex: ${highestEventIndex} lastEventIndex: ${lastEventIndex} firstEventOffset: ${firstEventOffset}`)
  var newFirstEventOffset = firstEventOffset + handled;
  if ((newFirstEventOffset + 1) / 16 > 1) { // shift entries left
    var firstEntry = entryIndex(newFirstEventOffset);
    var lastEntry = entryIndex(highestEventIndex);
    var numberOfEntries = lastEntry - firstEntry + 1;
    console.log(`copying left: firstEntry ${firstEntry} lastEntry: ${lastEntry} numberOfEntries: ${numberOfEntries}`)
    processedEvents.copyWithin(0, firstEntry, lastEntry+1);
    for (var i = numberOfEntries; i <= lastEntry; i++) {
      processedEvents[i] = 0;
    }
    firstEventOffset = newFirstEventOffset % 16;
  } else {
    firstEventOffset = newFirstEventOffset;
  }
  lastEventIndex += handled;
}

function bitIndex(index) {
  return (index - lastEventIndex - 1 + firstEventOffset) % 16;
}

function entryIndex(index) {
  return Math.floor((index - lastEventIndex - 1 + firstEventOffset) / 16);
}

function readEventMark(index) {
    var bitInx = bitIndex(index);
    var entryInx = entryIndex(index);
    var entry = processedEvents[entryInx];
    return (entry >> bitInx) & 1 ? true : false
}

function setEventMark(index) {
    var bitInx = bitIndex(index);
    var entryInx = entryIndex(index);
    var entry = processedEvents[entryInx];
    entry = entry | (1 << bitInx);
    processedEvents[entryInx] = entry;  
    highestEventIndex = Math.max(highestEventIndex, index);
}

// End implementation of time-ordered bit-array. TODO - turn this into a JS 'class' that can be instantiated

function processStoredEvents(events) {
  for (var i=0; i< events.length; i++) {
    var event = events[i];    
    console.log('processStoredEvent:', 'event:', event.index);
    setEventMark(parseInt(event.index));
  }
  disposeOldEvents();
}

function fetchStoredEvents() {
  disposeOldEvents();
  db.withEventsAfter(lastEventIndex, processStoredEvents);
}

function init(callback) {
  db.withLastEventID(function(err, id) {
    if (err) {
      console.log('unable to get last value of event ID')
    } else {
      lastEventIndex = id - 1;
      db.registerCache(ipAddress, setPeerCaches);
      setInterval(db.registerCache, ONEMINUTE, ipAddress, setPeerCaches);
      setInterval(db.discardCachesOlderThan, TWOMINUTES, TENMINUTES);
      setInterval(fetchStoredEvents, TWOMINUTES);
      setInterval(db.discardEventsOlderThan, TENMINUTES, ONEHOUR);
      callback();
    }
  });  
}

// end cache handling

function requestHandler(req, res) {
  if (req.url == '/events') {
    if (req.method == 'POST') {
      lib.getServerPostBody(req, res, processEvent);
    } else { 
      lib.methodNotAllowed(req, res, ['POST']);
    }
  } else {
    var req_url = url.parse(req.url);
    if (req_url.pathname == '/allowed-actions' && req_url.search !== null){ 
      if (req.method == 'GET') {
        getAllowedActions(req, res, lib.internalizeURL(req_url.search.substring(1), req.headers.host));
      } else {
        lib.methodNotAllowed(req, res, ['GET']);
      }
    } else if (req_url.pathname == '/is-allowed' && req_url.search !== null) {
      if (req.method == 'GET') {
        isAllowed(req, res, req_url.search.substring(1));
      } else {
        lib.methodNotAllowed(req, res, ['GET']);
      }
    } else {
      lib.notFound(req, res);
    }
  }
}

db.createTablesThen(function () {
  var port = process.env.PORT;
  init(function() {
    http.createServer(requestHandler).listen(port, function() {
      console.log(`server is listening on ${port}`);
    });
  });
});
