'use strict'
const http = require('http')
const url = require('url')
const lib = require('@apigee/http-helper-functions')
const rLib = require('@apigee/response-helper-functions')
const db = require('./directories-pg.js')
const pLib = require('@apigee/permissions-helper-functions')
const querystring = require('querystring')

const DIRECTORY = '/dir-dir-'
const ENTRY = '/dir-entry-'
const DIRECTORIES = '/dir-directories'
const ENTRIES = '/dir-entries'
const FIND_ENTRIES = '/dir-entries/'
const CHECK_PERMISSIONS = !(process.env.CHECK_PERMISSIONS == 'false')

const PERMISSIONS_CLIENTID = process.env.PERMISSIONS_CLIENTID
const PERMISSIONS_CLIENTSECRET = process.env.PERMISSIONS_CLIENTSECRET
const AUTH_URL = process.env.AUTH_URL
var PERMISSIONS_CLIENT_TOKEN

if (PERMISSIONS_CLIENTID == null || PERMISSIONS_CLIENTSECRET == null || AUTH_URL == null) {
  console.log(PERMISSIONS_CLIENTID == null ? 'PERMISSIONS_CLIENTID must be set' : PERMISSIONS_CLIENTSECRET == null ? 'PERMISSIONS_CLIENTSECRET must be set' : 'AUTH_URL must be set')
  process.exit(1)
}

function addCalculatedProperties(directory) {
}

function verifyDirectory(req, res, directory, callback) {
  if (!directory.kind == 'Directory')
    rLib.badRequest(res, {msg: 'invalid JSON: "kind" property not set to "Directory" ', body: directory})
  else if (typeof directory._permissions != 'object')
    rLib.badRequest(res, {msg: 'invalid JSON: must provide _permissions property of Directory ', body: directory})
  else
    callback()
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

function createDirectory(req, res, directory) {
  var err = verifyDirectory(req, res, directory, () => {
    var user = lib.getUser(req.headers.authorization)
    lib.setStandardCreationProperties(req, directory, user)
    var id = `${DIRECTORY}${rLib.uuidw()}`
    var selfURL = id
    var permissions = directory._permissions
    delete directory._permissions; // interesting unusual case where ; is necessary
    new pLib.Permissions(permissions).resolveRelativeURLs(id)
    lib.withValidClientToken(res, PERMISSIONS_CLIENT_TOKEN, PERMISSIONS_CLIENTID, PERMISSIONS_CLIENTSECRET, AUTH_URL, function(newToken) {
      let headers = lib.flowThroughHeaders(req)
      if (newToken)
        PERMISSIONS_CLIENT_TOKEN = newToken
      headers['x-client-authorization'] = `Bearer ${PERMISSIONS_CLIENT_TOKEN}`
      createPermissionsThen(headers, res, id, permissions, (err, permissionsURL, permissions, responseHeaders) => {
        // Create permissions first. If we fail after creating the permissions resource but before creating the main resource, 
        // there will be a useless but harmless permissions document.
        // If we do things the other way around, a directory without matching permissions could cause problems.
        db.createResourceThen(res, 'directory', id, directory, etag => {
          directory.self = id 
          addCalculatedProperties(directory)
          rLib.created(res, directory, req.headers.accept, id, etag)
        })
      })
    })
  })
}

function getDirectory(req, res, id) {
  ifAllowedThen(lib.flowThroughHeaders(req), res, req.url, '_self', 'read', (err, reason) => {
    db.withResourceDo(res, 'directory', id, (directory , etag) => {
      directory.self = id
      addCalculatedProperties(directory)
      rLib.found(res, directory, req.headers.accept, directory.self, etag)
    })
  })
}

function deleteDirectory(req, res, id) {
  ifAllowedThen(lib.flowThroughHeaders(req), res, req.url, '_self', 'delete', (err, reason) => {
    db.deleteResourceThen(res, 'directory', id, (directory, etag) => {
      pLib.deletePermissionsThen(lib.flowThroughHeaders(req), res, id,  () => {
        console.log(`correctly deleted permissions for ${id}`)
      })
      directory.self = id
      addCalculatedProperties(directory)
      rLib.found(res, directory, req.headers.accept, directory.self, etag)
    })
  })
}

function updateDirectory(req, res, id, patch) {
  ifAllowedThen(lib.flowThroughHeaders(req), res, null, '_self', 'update', () => {
    db.withDirectoryDo(res, 'directory', id, (directory , etag) => {
      lib.applyPatch(req.headers, res, directory, patch, patchedDirectory => {
        db.updateResourceThen(res, id, directory, patchedDirectory, etag, etag => {
          patchedDirectory.self = id 
          addCalculatedProperties(patchedDirectory)
          rLib.found(res, patchedDirectory, req.headers.accept, patchedDirectory.self, etag)
        })
      })
    })
  })
}

function verifyEntry(req, res, entry, callback) {
  if (entry.kind == 'Entry')
    if (typeof entry.name == 'string')
      if (typeof entry.directory == 'string')
        if (typeof entry.resource == 'string')
          callback()
        else
          rLib.badRequest(res, {msg: 'invalid JSON: Entry must reference a resource', body: entry})
      else
        rLib.badRequest(res, {msg: 'invalid JSON: Entry must be in a Directory', body: entry})
    else
      rLib.badRequest(res, {msg: 'invalid JSON: Entry must have a name', body: entry})
  else
    rLib.badRequest(res, {msg: 'invalid JSON: "kind" property not set to "Entry" ', body: entry})
}

function createEntry(req, res, entry) {
  // enties don't have their own permissions documents — permissions are derived from the enclosing directory
  verifyEntry(req, res, entry, () => {
    ifAllowedThen(lib.flowThroughHeaders(req), res, entry.directory, 'dir-entries', 'add', () => {
      var user = lib.getUser(req.headers.authorization)
      lib.setStandardCreationProperties(req, entry, user)
      var id = `${ENTRY}${rLib.uuidw()}`
      var selfURL = id
      db.createResourceThen(res, 'entry', id, entry, etag => {
        entry.self = id 
        addCalculatedProperties(entry)
        rLib.created(res, entry, req.headers.accept, id, etag)
      })
    })
  })
}

function getEntry(req, res, id) {
  db.withResourceDo(res, 'entry', id, (entry , etag) => {
    ifAllowedThen(lib.flowThroughHeaders(req), res, entry.directory, '_self', 'read', (err, reason) => {
      entry.self = id
      addCalculatedProperties(entry)
      rLib.found(res, entry, req.headers.accept, entry.self, etag)
    })
  })
}

function deleteEntry(req, res, id) {
  db.withResourceDo(res, 'entry', id, (entry , etag) => {
    ifAllowedThen(lib.flowThroughHeaders(req), res, entry.directory, 'dir-entries', 'remove', (err, reason) => {
      db.deleteResourceThen(res, id, 'entry', (entry, etag) => {
        pLib.deletePermissionsThen(lib.flowThroughHeaders(req), res, id, () => {
          console.log(`correctly deleted permissions for ${id}`)
        })
        entry.self = id
        addCalculatedProperties(entry)
        rLib.found(res, entry, req.headers.accept, entry.self, etag)
      })
    })
  })
}

function updateEntry(req, res, id, patch) {
  db.withEntryDo(res, id, (entry , etag) => {
    ifAllowedThen(lib.flowThroughHeaders(req), res, entry.directory, '_self', 'update', () => {
      lib.applyPatch(req.headers, res, entry, patch, patchedEntry => {
        db.updateResourceThen(res, 'entry', id, entry, patchedEntry, etag, etag => {
          patchedEntry.self = id 
          addCalculatedProperties(patchedEntry)
          rLib.found(res, patchedEntry, req.headers.accept, patchedEntry.self, etag)
        })
      })
    })
  })
}

function findEntry(req, res, query) {
  let qs = querystring.parse(query)
  if ('path' in qs)
    if (Object.keys(qs).length == 1)
      findEntryByPath(qs['path'])
    else
      rLib.badRequest(res, {msg: 'cannot mix path query with other parameters', query: query})
  else if ('directory' in qs || 'resource' in qs)
    if ('directory' in qs && 'name' in qs)
      db.withEntryByDirectoryAndNameDo(res, qs['directory'], qs['name'], (id, entry) => {
        entry.self = id
        addCalculatedProperties(entry)
        rLib.found(res, entry, req.headers.accept, entry.self, entry.etag)
      })
    else if ('directory' in qs && 'resource' in qs)
      db.withEntryByDirectoryAndResourceDo(res, qs['directory'], qs['resource'], (id, entry) => {
        entry.self = id
        addCalculatedProperties(entry)
        rLib.found(res, entry, req.headers.accept, entry.self, entry.etag)
      })
    else
      rLib.badRequest(res, {msg: 'may provide "directory" and "name" or "directory" and "resource", but not this combination', query: query})
  else {
    let params = Object.keys(qs)
    if (params.length == 1 && !(params[0] == 'name' && qs['name'] != ''))
      findEntryByPath(params[0])
    else
      rLib.badRequest(res, {msg: 'unrecognized query parameters', query: query})
  }
  function findEntryByPath(path) {
    db.withEntryByPathDo(res, path, (id, entry) => {
      entry.self = id
      addCalculatedProperties(entry)
      rLib.found(res, entry, req.headers.accept, entry.self, entry.etag)
    })
  }
}

function requestHandler(req, res) {
  var parsedURL = url.parse(req.url)
  if (req.url == DIRECTORIES) 
    if (req.method == 'POST') 
      lib.getServerPostObject(req, res, dir => createDirectory(req, res, dir))
    else 
      rLib.methodNotAllowed(res, ['POST'])
  else if (req.url == ENTRIES) 
    if (req.method == 'POST') 
      lib.getServerPostObject(req, res, entry => createEntry(req, res, entry))
    else 
      rLib.methodNotAllowed(res, ['POST'])
  else if (parsedURL.pathname.startsWith(DIRECTORY)) {
    var id = parsedURL.pathname
    if (req.method == 'GET')
      getDirectory(req, res, id)
    else if (req.method == 'DELETE') 
      deleteDirectory(req, res, id)
    else if (req.method == 'PATCH') 
      lib.getServerPostObject(req, res, (jso) => updateDirectory(req, res, id, jso))
    else
      rLib.methodNotAllowed(res, ['GET', 'DELETE', 'PATCH'])
  }
  else if (parsedURL.pathname.startsWith(ENTRY)) {
    var id = parsedURL.pathname
    if (req.method == 'GET')
      getEntry(req, res, id)
    else if (req.method == 'DELETE') 
      deleteEntry(req, res, id)
    else if (req.method == 'PATCH') 
      lib.getServerPostObject(req, res, (jso) => updateEntry(req, res, id, jso))
    else
      rLib.methodNotAllowed(res, ['GET', 'DELETE', 'PATCH'])
  } else if (parsedURL.pathname == ENTRIES && parsedURL.query) 
    // something like /dir-entries?/a/b/c, where a, b and c are entry names, a is an entry in root, b is an entry in the resource identified with a, 
    // and c is an entry in the resource identified by /a/b
    if (req.method == 'GET')
      findEntry(req, res, parsedURL.query)
    else if (req.method == 'DELETE') {
      let newRes = rLib.errorHandler(err => {
        if (err.statuscode == 200)
          deleteEntry(req, res, err.headers['Content-Location'])
        else
          rLib.respond(res, err.statusCode, {'content-type': err.headers['content-type']}, err.body)
      })
      findEntry(req, newRes, parsedURL.query)
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
      paths: ['/dir-directories', DIRECTORY, '/dir-entries', ENTRY],
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
