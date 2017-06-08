'use strict'
var Pool = require('pg').Pool
var rLib = require('response-helper-functions')
const db = require('./folders-pg.js')

function withErrorHandling(res, callback) {
  return function (err) {
    if (err == 404) 
      rLib.notFound(res, `//${req.headers.host}${req.url} not found`)
    else if (err)
      rLib.internalError(res, err)
    else 
      callback.apply(this, Array.prototype.slice.call(arguments, 1))
  }
}

function createFolderThen(res, id, folder, callback) {
  db.createFolderThen(id, folder, withErrorHandling(res, callback))
}

function withFolderDo(res, id, callback) {
  db.withFolderDo(id, withErrorHandling(res, callback))
}

function deleteFolderThen(res, id, callback) {
  db.deleteFolderThen(id, withErrorHandling(res, callback))
}

function updateFolderThen(res, id, folder, etag, callback) {
  db.updateFolderThen(id, folder, etag, withErrorHandling(res, callback))
}

function init(callback, aPool) {
  db.init(callback, aPool)
}

exports.createFolderThen = createFolderThen
exports.updateFolderThen = updateFolderThen
exports.deleteFolderThen = deleteFolderThen
exports.withFolderDo = withFolderDo
exports.init = init