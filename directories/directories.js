'use strict'
const http = require('http')
const url = require('url')
const lib = require('@apigee/http-helper-functions')
const rLib = require('@apigee/response-helper-functions')
const db = require('./directories-pg.js')
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
    var id = `${'/dir-dir-'}${rLib.uuidw()}`
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
        db.createDirectoryThen(res, id, directory, etag => {
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
    db.withDirectoryDo(res, id, (directory , etag) => {
      directory.self = id
      addCalculatedProperties(directory)
      rLib.found(res, directory, req.headers.accept, directory.self, etag)
    })
  })
}

function deleteDirectory(req, res, id) {
  ifAllowedThen(lib.flowThroughHeaders(req), res, req.url, '_self', 'delete', (err, reason) => {
    db.deleteDirectoryThen(res, id, (directory, etag) => {
      pLib.deletePermissionsThen(lib.flowThroughHeaders(req), res, id,  () => {
        console.log(`correctly deleted permissions for ${id}`)
      })
      directory.self = id
      addCalculatedProperties(directory)
      rLib.ok(res, directory, req.headers.accept, directory.self, etag)
    })
  })
}

function updateDirectory(req, res, id, patch) {
  ifAllowedThen(lib.flowThroughHeaders(req), res, null, '_self', 'update', () => {
    db.withDirectoryDo(res, id, (directory , etag) => {
      lib.applyPatch(req.headers, res, directory, patch, patchedDirectory => {
        db.updateResourceThen(res, id, directory, patchedDirectory, etag, etag => {
          patchedDirectory.self = id 
          addCalculatedProperties(patchedDirectory)
          rLib.ok(res, patchedDirectory, req.headers.accept, patchedDirectory.self, etag)
        })
      })
    })
  })
}


function requestHandler(req, res) {
  var parsedURL = url.parse(req.url)
  if (req.url == '/dir-directories') 
    if (req.method == 'POST') 
      lib.getServerPostObject(req, res, dir => createDirectory(req, res, dir))
    else 
      rLib.methodNotAllowed(res, ['POST'])
  else if (parsedURL.pathname.startsWith('/dir-dir-')) {
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
      paths: ['/dir-directories', '/dir-dir-'],
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
