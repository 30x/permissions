'use strict'
const http = require('http')
const url = require('url')
const lib = require('@apigee/http-helper-functions')
const rLib = require('@apigee/response-helper-functions')
const db = require('./entries-pg.js')
const pLib = require('@apigee/permissions-helper-functions')
const querystring = require('querystring')

const CHECK_PERMISSIONS = process.env.CHECK_PERMISSIONS !== 'false';

const PERMISSIONS_CLIENTID = process.env.PERMISSIONS_CLIENTID
const PERMISSIONS_CLIENTSECRET = process.env.PERMISSIONS_CLIENTSECRET
const AUTH_URL = process.env.AUTH_URL
var PERMISSIONS_CLIENT_TOKEN

if (PERMISSIONS_CLIENTID == null || PERMISSIONS_CLIENTSECRET == null || AUTH_URL == null) {
  console.log(PERMISSIONS_CLIENTID == null ? 'PERMISSIONS_CLIENTID must be set' : PERMISSIONS_CLIENTSECRET == null ? 'PERMISSIONS_CLIENTSECRET must be set' : 'AUTH_URL must be set')
  process.exit(1)
}

function addCalculatedProperties(entry) {
}

function ifAllowedThen(headers, res, subject, property, action, callback) {
  if (CHECK_PERMISSIONS)
    pLib.ifAllowedThen(headers, res, subject, property, action, callback)
  else
    callback(true)
}

function createPermissionsThen(headers, res, id, permissions, callback) {
  if (CHECK_PERMISSIONS)
    pLib.createPermissionsThen(headers, res, id, permissions, callback)
  else
    callback(true)
}

function verifyEntry(req, res, entry, callback) {
  if (entry.kind == 'Entry')
    if (typeof entry.name == 'string')
      if (typeof entry.namespace == 'string')
        if (typeof entry.namedResource == 'string')
          callback()
        else
          rLib.badRequest(res, {msg: 'invalid JSON: Entry must reference a namedResource', body: entry})
      else
        rLib.badRequest(res, {msg: 'invalid JSON: Entry must be in a namespace', body: entry})
    else
      rLib.badRequest(res, {msg: 'invalid JSON: Entry must have a name', body: entry})
  else
    rLib.badRequest(res, {msg: 'invalid JSON: "kind" property not set to "Entry" ', body: entry})
}

function createEntry(req, res, entry) {
  // entries don't have their own permissions documents — permissions are derived from the enclosing namespace
  verifyEntry(req, res, entry, () => {
    ifAllowedThen(lib.flowThroughHeaders(req), res, entry.namespace, 'nym-entries', 'create', () => {
      var user = lib.getUser(req.headers.authorization)
      lib.setStandardCreationProperties(req, entry, user)
      var id = `${'/nym-ety-'}${rLib.uuidw()}`
      var selfURL = id
      db.createEntryThen(res, id, entry, etag => {
        entry.self = id 
        addCalculatedProperties(entry)
        rLib.created(res, entry, req.headers.accept, id, etag)
      })
    })
  })
}

function getEntry(req, res, id) {
  db.withEntryDo(res, id, entry => {
    ifAllowedThen(lib.flowThroughHeaders(req), res, entry.namespace, '_self', 'read', (err, reason) => {
      entry.self = id
      addCalculatedProperties(entry)
      rLib.found(res, entry, req.headers.accept, entry.self, entry.etag)
    })
  })
}

function deleteEntry(req, res, id) {
  db.withEntryDo(res, id, entry => {
    ifAllowedThen(lib.flowThroughHeaders(req), res, entry.namespace, 'nym-entries', 'remove', (err, reason) => {
      db.deleteEntryThen(res, id, entry => {
        pLib.deletePermissionsThen(lib.flowThroughHeaders(req), res, id, () => {
          console.log(`correctly deleted permissions for ${id}`)
        })
        entry.self = id
        addCalculatedProperties(entry)
        rLib.ok(res, entry, req.headers.accept, entry.self, entry.etag)
      })
    })
  })
}

function updateEntry(req, res, id, patch) {
  db.withEntryDo(res, id, entry => {
    ifAllowedThen(lib.flowThroughHeaders(req), res, entry.namespace, '_self', 'update', () => {
      lib.applyPatch(req.headers, res, entry, patch, patchedEntry => {
        db.updateEntryThen(res, id, entry, patchedEntry, entry.etag, etag => {
          patchedEntry.self = id 
          addCalculatedProperties(patchedEntry)
          rLib.ok(res, patchedEntry, req.headers.accept, patchedEntry.self, etag)
        })
      })
    })
  })
}

function findEntryByPath(req, res, query) {
  db.withEntryByPathDo(res, query, (id, entry) => {
    entry.self = id
    addCalculatedProperties(entry)
    rLib.found(res, entry, req.headers.accept, entry.self, entry.etag)
  })
}

function findEntries(req, res, query) {
  let qs = querystring.parse(query)
  if ('namedResource' in qs)
    if (Object.keys(qs).length == 1)
      db.withEntriesForNamedResourceDo(res, qs['namedResource'], entries => {
        let rslt = {kind: 'Collection'}
        rslt.contents = entries
        rslt.self = req.url
        rLib.found(res, rslt, req.headers.accept, rslt.self)
      })
    else
      rLib.badRequest(res, {msg: 'may only provide "namedResource" parameter', query: query})
  else 
    rLib.badRequest(res, {msg: 'unrecognized query parameters', query: query})
}

function deleteEntries(req, res, query) {
  let qs = querystring.parse(query)
  if ('namedResource' in qs)
    if (Object.keys(qs).length == 1)
      db.deleteEntriesForNamedResourceThen(res, qs['namedResource'], entries => {
        let rslt = {kind: 'Collection'}
        rslt.contents = entries
        rslt.self = req.url
        rLib.ok(res, rslt, req.headers.accept, rslt.self)
      })
    else
      rLib.badRequest(res, {msg: 'may only provide "namedResource" parameter', query: query})
  else 
    rLib.badRequest(res, {msg: 'unrecognized query parameters', query: query})
}

function requestHandler(req, res) {
  var parsedURL = url.parse(req.url)
  if (req.url == '/nym-entries' || req.url == '/name-entries') 
    if (req.method == 'POST') 
      lib.getServerPostObject(req, res, entry => createEntry(req, res, entry))
    else 
      rLib.methodNotAllowed(res, ['POST'])
  else if (parsedURL.pathname.startsWith('/nym-ety-') || parsedURL.pathname.startsWith('/name-ety-')) {
    var id = parsedURL.pathname
    if (req.method == 'GET')
      getEntry(req, res, id)
    else if (req.method == 'DELETE') 
      deleteEntry(req, res, id)
    else if (req.method == 'PATCH') 
      lib.getServerPostObject(req, res, (jso) => updateEntry(req, res, id, jso))
    else
      rLib.methodNotAllowed(res, ['GET', 'DELETE', 'PATCH'])
  } else if ((parsedURL.pathname == '/nym-entry' || parsedURL.pathname == '/name-entry') && parsedURL.query) 
    // something like /nym-entry?/a/b/c, where a, b and c are entry names, 
    // a is an entry in root, b is an entry in the namespace identified by a, 
    // and c is an entry in the namespace identified by /a/b
    if (req.method == 'GET')
      findEntryByPath(req, res, parsedURL.query)
    else {
      let newRes = rLib.errorHandler(err => {
        if (err.statuscode == 200)
          if (req.method == 'DELETE')
            deleteEntry(req, res, err.headers['Content-Location'])
          else if (req.method == 'PATCH')
            lib.getServerPostObject(req, res, patch => updateEntry(req, res, err.headers['Content-Location'], patch))
          else
            rLib.rLib.methodNotAllowed(res, ['GET', 'DELETE', 'PATCH'])
        else
          rLib.respond(res, err.statusCode, {'content-type': err.headers['content-type']}, err.body)
      })
      findEntryByPath(req, newRes, parsedURL.query)
    }
  else if ((parsedURL.pathname == '/nym-resource' || parsedURL.pathname == '/name-resource') && parsedURL.query)
    // something like /nym-resource?/a/b/c, where a, b and c are entry names, 
    // a is an entry in root, b is an entry in the namespace identified by /a, 
    // and c is an entry in the namespace identified by /a/b
    lib.getServerPostBuffer(req, (buff) => {
      let newRes = rLib.errorHandler(err => {
        if ((err.statusCode / 100 || 0) == 2) {
          let entry = JSON.parse(err.body)
          lib.sendInternalRequestThen(res, req.method, entry.namedResource, req.headers, buff, (clientRes) => {
            lib.getClientResponseBuffer(clientRes, (buff2) => {
              delete clientRes.headers.connection
              delete clientRes.headers['content-length']
              rLib.respond(res, clientRes.statusCode, clientRes.headers, buff2)  
            })
          })
        } else
          rLib.respond(res, err.statusCode, {'content-type': err.headers['content-type']}, err.body)
      })
      findEntryByPath(req, newRes, parsedURL.query)
    })
  else if ((parsedURL.pathname == '/nym-entries' || parsedURL.pathname == '/name-entries') && parsedURL.query) 
    // something like /nym-entries?namedResource='/xxxxx'
    if (req.method == 'GET')
      findEntries(req, res, parsedURL.query)
    else if (req.method == 'DELETE') {
      deleteEntries(req, res, parsedURL.query)
    } else
      rLib.methodNotAllowed(res, ['GET', 'DELETE'])
  else 
    rLib.notFound(res, `//${req.headers.host}${req.url} not found`)
}

function init(callback, aPool) {
  db.init(callback, aPool)
}

function run(){
  init(() => {
    var port = process.env.PORT
    http.createServer(requestHandler).listen(port, () => {
      console.log(`server is listening on ${port}`)
    })
  })
}

function start() {
  if (require.main === module) 
    run()
  else
    module.exports = {
      requestHandler:requestHandler,
      paths: ['/nym-', '/name-'],
      init: init
    }
}

if (process.env.INTERNAL_SY_ROUTER_HOST == 'kubernetes_host_ip') 
  lib.getHostIPThen((err, hostIP) => {
    if (err) 
      process.exit(1)
    else {
      process.env.INTERNAL_SY_ROUTER_HOST = hostIP
      start()
    }
  })
else 
  start()
