'use strict'
const Pool = require('pg').Pool
const rLib = require('response-helper-functions')
const db = require('./teams-pg.js')

function withErrorHandling(req, res, callback) {
  return function (err) {
    if (err == 404) 
      rLib.notFound(res, {msg: `//${req.headers.host}${req.url} not found`, component: 'teams-db'})
    else if (err)
      rLib.internalError(res, err)
    else 
      callback.apply(this, Array.prototype.slice.call(arguments, 1))
  }
}

function createTeamThen(req, res, id, selfURL, team, scopes, callback) {
  db.createTeamThen(req, id, selfURL, team, scopes, withErrorHandling(req, res, callback))
}

function withTeamDo(req, res, id, callback) {
  db.withTeamDo(req, id, withErrorHandling(req, res, callback))
}

function withTeamsForUserDo(req, res, user, callback) {
  db.withTeamsForUserDo(req, user, withErrorHandling(req, res, callback))
}
    
function deleteTeamThen(req, res, id, selfURL, scopes, callback) {
  db.deleteTeamThen(req, id, selfURL, scopes, withErrorHandling(req, res, callback))
}

function updateTeamThen(req, res, id, selfURL, patchedTeam, scopes, etag, callback) {
  db.updateTeamThen(req, id, selfURL, patchedTeam, scopes, etag, withErrorHandling(req, res, callback))
}

function withTeamMiscDo(req, res, id, callback) {
  db.withTeamMiscDo(req, id, withErrorHandling(req, res, callback))
}

function updateTeamMiscThen(req, res, id, patchedMisc, callback) {
  db.updateTeamMiscThen(req, id, patchedMisc, withErrorHandling(req, res, callback))  
}

function init(callback, aPool) {
  db.init(callback, aPool)
}

exports.createTeamThen = createTeamThen
exports.updateTeamThen = updateTeamThen
exports.deleteTeamThen = deleteTeamThen
exports.withTeamDo = withTeamDo
exports.withTeamsForUserDo = withTeamsForUserDo
exports.withTeamMiscDo = withTeamMiscDo
exports.updateTeamMiscThen = updateTeamMiscThen
exports.init = init