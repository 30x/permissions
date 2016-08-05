'use strict';
var http = require('http');
var lib = require('./standard-functions.js');
var db = require('./permissions-db.js');
var querystring = require('querystring');
var url = require('url');

var PROTOCOL = process.env.PROTOCOL || 'http:';
var ANYONE = 'http://apigee.com/users/anyone';
var INCOGNITO = 'http://apigee.com/users/incognito';
var OPERATIONPROPERTIES = ['creators', 'readers', 'updaters', 'deleters'];
var OPERATIONS = ['create', 'read', 'update', 'delete'];

function withTeamsDo(req, res, user, callback) {
  return lib.withTeamsDo(req, res, user, callback)
}

function getAllowedActions(req, res, queryString) {
  var queryParts = querystring.parse(queryString);
  var resource = lib.internalizeURL(queryParts.resource, req.headers.host);
  var user = queryParts.user
  if (user == lib.getUser(req)) { 
    withAllowedActionsDo(req, res, resource, false, function(allowedActions) {
      lib.found(req, res, allowedActions);
    });
  } else {
    lib.badRequest(res, 'user in query string must match user credentials')
  }
}

function collateAllowedActions(permissionsObject, actors) {
  var allowedActions = {};
  for (var i = 0; i < OPERATIONPROPERTIES.length; i++) {
    var actionProperty = OPERATIONPROPERTIES[i];
    var allowedActors = permissionsObject[actionProperty];
    if (allowedActors !== undefined) {
      if (allowedActors.indexOf(INCOGNITO) > -1) { 
        allowedActions[OPERATIONS[i]] = true;
      } else if (actors !== null) {
        if (allowedActors.indexOf(ANYONE) > -1) {
          allowedActions[OPERATIONS[i]] = true;          
        } else {
          for (var j=0; j<actors.length; j++) {
            var user = actors[j];
            if (allowedActors.indexOf(user) > -1 ) { 
              allowedActions[OPERATIONS[i]] = true;
            }
          }
        }
      }
    }
  }
  return allowedActions;
}

function isActionAllowed(permissionsObject, actors, action) {
  var actionProperty = OPERATIONPROPERTIES[OPERATIONS.indexOf(action)];
  var allowedActors = permissionsObject[actionProperty];
  if (allowedActors !== undefined) {
    if (allowedActors.indexOf(INCOGNITO) > -1) { 
      return true;
    } else if (actors !== null) {
      if (allowedActors.indexOf(ANYONE) > -1) {
        return true;
      } else {
        for (var j=0; j<actors.length; j++) {
          var actor = actors[j];
          if (allowedActors.indexOf(actor) > -1 ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function cache(resource, permissions, etag) {
  permissions._Etag = etag;
  permissionsCache[resource] = permissions;
}

function processEvent(req, res, event) {
  console.log('processEvent: peerCaches:', peerCaches, 'selfAuthority:', selfAuthority, 'event:', JSON.stringify(event));
  setEventMark(parseInt(event.index));
  delete permissionsCache[lib.internalizeURL(event.data.subject)];
  for (var i = 0; i < peerCaches.length; i++) {
    var cache = peerCaches[i];
    if (cache != selfAuthority) {
      lib.sendEventThen(req, event, cache, function(err) {
        if (err) {
          console.log(`failed to send event to ${cache}`);
        }
    });
    }
  }
  lib.found(req, res);
}

function withPermissionsDo(req, res, resource, callback) {
  var permissions = permissionsCache[resource];
  if (permissions !== undefined) {
    callback(permissions, permissions._Etag);
  } else {
    db.withPermissionsDo(req, res, resource, function(permissions, etag) {
      cache(resource, permissions, etag);
      callback(permissions, etag);
    });
  }
}

function withPermissionFlagDo(req, res, subject, action, subjectIsPermission, callback) {
  subject = lib.internalizeURL(subject);
  var recursionSet = {};
  var originalPermissons = null;
  function ifActorsAllowedDo(actors, resource, callback) {
    withPermissionsDo(req, res, resource, function(permissions) {
      if (subjectIsPermission && resource == subject) {
        originalPermissons = permissions;
      }
      var allowed = isActionAllowed(subjectIsPermission ? permissions : permissions.governs, actors, action);
      if (allowed) {
        if (subjectIsPermission) {
          callback(true, JSON.parse(JSON.stringify(originalPermissons)), originalPermissons._Etag)
        } else {
          callback(true);
        }
      } else {
        var inheritsPermissionsOf = permissions.governs.inheritsPermissionsOf;
        if (inheritsPermissionsOf !== undefined) {
          inheritsPermissionsOf = inheritsPermissionsOf.filter((x) => {return !(x in recursionSet);}) 
          if (inheritsPermissionsOf.length > 0) {
            var count = 0;
            for (var j = 0; j < inheritsPermissionsOf.length; j++) {
              ifActorsAllowedDo(actors, inheritsPermissionsOf[j], function() {
                if (++count == inheritsPermissionsOf.length) {
                  if (subjectIsPermission) {
                    callback(true, JSON.parse(JSON.stringify(originalPermissons)), originalPermissons._Etag)
                  } else {
                    callback(true);
                  }
                }
              });
            }
          } else {
            callback(false);
          }
        } else {
          callback(false);
        }
      }
    });
  }
  var user = lib.getUser(req);
  withTeamsDo(req, res, user, function(actors) {  
    ifActorsAllowedDo(actors, subject, callback);
  });
}

function withAllowedActionsDo(req, res, resource, subjectIsPermission, callback) {
  var recursionSet = {};
  function withActorsAllowedActionsDo(req, res, actors, resource, subjectIsPermission, callback) {
    withPermissionsDo(req, res, resource, function(permissions) {
      var actions = collateAllowedActions(subjectIsPermission ? permissions : permissions.governs, actors);
      var inheritsPermissionsOf = permissions.governs.inheritsPermissionsOf;
      if (inheritsPermissionsOf !== undefined) {
        inheritsPermissionsOf = inheritsPermissionsOf.filter((x) => {return !(x in recursionSet);}) 
        if (inheritsPermissionsOf.length > 0) {
          var count = 0;
          for (var j = 0; j < inheritsPermissionsOf.length; j++) {
            withActorsAllowedActionsDo(req, res, actors, resource, actions, subjectIsPermission, function(nestedActions) {
              Object.assign(actions, nestedActions);
              if (++count == inheritsPermissionsOf.length) {
                callback(actions);
              }
            });
          }
        } else {
          callback(actions);
        }
      } else {
        callback(actions);
      }
    });
  }
  var user = lib.getUser(req);
  withTeamsDo(req, res, user, function(actors) {  
    withActorsAllowedActionsDo(req, res, actors, resource, subjectIsPermission, function(actions) {
      callback(Object.keys(actions));
    });
  });
}

function isAllowed(req, res, queryString) {
  var queryParts = querystring.parse(queryString);
  var resource = lib.internalizeURL(queryParts.resource);
  var user = queryParts.user;
  var action = queryParts.action;
  var resourceParts = url.parse(resource);
  var subjectIsPermission = false;
  if (resourceParts.pathname == '/permissions' && resourceParts.search != null) {
    subjectIsPermission = true;
    resource = resourceParts.search.substring(1);
  }
  if (action !== undefined && resource !== undefined && user == lib.getUser(req)) {
    withPermissionFlagDo(req, res, resource, action, subjectIsPermission, function(answer) {
      lib.found(req, res, answer);
    });
  } else {
    lib.badRequest(res, 'action and resource must be provided and user in query string must match user credentials ' + req.url)
  }
}

// begin cache handling

var permissionsCache = {};
var teamsCache = {};

function processStoredEvents(events) {
  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    var cacheEntry = permissionsCache[event.subject];
    if (cacheEntry !== undefined) {
      if (cacheEntry.etag < event.etag) {
        console.log(`processing missed event: ${event.subject}`)
        delete permissionsCache[event.subject];
      }
    }
  }
}

var ONEMINUTE = 60*100;
var TWOMINUTES = 2*60*100;
var TENMINUTES = 10*60*100;
var ONEHOUR = 60*60*100;

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

var processedEvents = new Uint16Array(1000);      // TODO convert to typed array to increase efficiency
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

function processStoredEvents(events) {
  for (var i=0; i< events.length; i++) {
    var event = events[i];    
    console.log('processStoredEvent:', 'event:', event.index);
    setEventMark(parseInt(event.index));
  }
  disposeOldEvents();
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
