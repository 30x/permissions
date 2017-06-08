'use strict'
const lib = require('http-helper-functions')
const rLib = require('response-helper-functions')
const db = require('./permissions-maintenance-pg.js')

function withErrorHandling(req, res, callback) {
  return function (err) {
    if (err == 404) 
      rLib.notFound(res, `//${req.headers.host}${req.url} not found`)
    else if (err == 409) 
      rLib.duplicate(res, 'permissions-maintenance-db: permissions already exist for this subject')
    else if (err)
      rLib.internalError(res, err)
    else 
      callback.apply(this, Array.prototype.slice.call(arguments, 1))
  }
}

function withPermissionsDo(req, res, subject, callback) {
  db.withPermissionsDo(req, subject, withErrorHandling(req, res, callback))
}

function deletePermissionsThen(req, res, subject, callback) {
  db.deletePermissionsThen(req, subject, withErrorHandling(req, res, callback))
}

function createPermissionsThen(req, res, permissions, scopes, callback) {
  db.createPermissionsThen(req, permissions, scopes, withErrorHandling(req, res, callback))
}

function updatePermissionsThen(req, res, subject, patchedPermissions, scopes, etag, callback) {
  db.updatePermissionsThen(req, subject, patchedPermissions, scopes, etag, withErrorHandling(req, res, callback))
}

function putPermissionsThen(req, res, subject, permissions, scopes, callback) {
  db.putPermissionsThen(req, subject, permissions, scopes, withErrorHandling(req, res, callback))
}

function withResourcesSharedWithActorsDo(req, res, actors, callback) {
  db.withResourcesSharedWithActorsDo(req, actors, withErrorHandling(req, res, callback))
}

function withHeirsDo(req, res, securedObject, callback) {
  db.withHeirsDo(req, securedObject, withErrorHandling(req, res, callback))
}

function init(callback, aPool) {
  db.init(callback, aPool)    
}

process.on('unhandledRejection', function(e) {
  console.log(e.message, e.stack)
})

exports.withPermissionsDo = withPermissionsDo
exports.createPermissionsThen = createPermissionsThen
exports.deletePermissionsThen = deletePermissionsThen
exports.updatePermissionsThen = updatePermissionsThen
exports.putPermissionsThen = putPermissionsThen
exports.withResourcesSharedWithActorsDo = withResourcesSharedWithActorsDo
exports.withHeirsDo = withHeirsDo
exports.init = init
exports.db = db