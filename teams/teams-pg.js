'use strict'
const Pool = require('pg').Pool
const lib = require('@apigee/http-helper-functions')
const rLib = require('@apigee/response-helper-functions')
const pge = require('@apigee/pg-event-producer')
const randomBytes = require('crypto').randomBytes

const TEAMS = '/az-teams/'

const config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
}

var pool
var eventProducer

function createTeamThen(req, errorHandler, id, selfURL, team, scopes, callback) {
  let changeEvent = {
    subject: selfURL, 
    action: 'create',
    team: team,
    scopes: scopes
  }
  eventProducer.createResourceThen(req, errorHandler, id, team, 'teams', changeEvent, (resourceRecord, eventRecord) => {
    callback(team.etag)
  })
}

function withTeamDo(req, errorHandler, id, callback) {
  pool.query('SELECT etag, data FROM teams WHERE id = $1', [id], function (err, pg_res) {
    if (err) {
      rLib.internalError(errorHandler, {msg: 'unable to query teams table', err: err, id: id})
    }
    else {
      if (pg_res.rowCount === 0) { 
        rLib.notFound(errorHandler, {msg: 'unable to find team', id: id})
      }
      else {
        var row = pg_res.rows[0]
        callback(row.data, row.etag)
      }
    }
  })
}

function withTeamsForUserDo(req, errorHandler, user, callback) {
  //var query = "SELECT id FROM teams, jsonb_array_elements(teams.data->'members') AS member WHERE member = $1"
  var query = "SELECT id FROM teams WHERE data->'members' ? $1"
  pool.query(query, [user], function (err, pg_res) {
    if (err) {
      rLib.internalError(errorHandler, {msg: 'unable to query teams table', err: err, user: user})
    }
    else {
      callback(pg_res.rows.map(row => row.id))
    }
  })
}
    
function deleteTeamThen(req, res, id, selfURL, scopes, callback) {
  let changeEvent = {
    subject: TEAMS + id, 
    action: 'delete',
    scopes: scopes
  }
  eventProducer.deleteResourceThen(req, res, id, 'teams', changeEvent, (deletedRecord) => 
    callback(deletedRecord.data, deletedRecord.etag)
  )
}

function updateTeamThen(req, errorHandler, id, selfURL, priorTeam, patchedTeam, scopes, ifMatch, callback) {
  let changeEvent = {
    subject: selfURL, 
    action: 'update',
    after: patchedTeam,
    scopes: scopes
  }
  eventProducer.updateResourceThen(req, errorHandler, id, patchedTeam, ifMatch, priorTeam, 'teams', changeEvent, (eventRecord) => {
    callback(patchedTeam.etag)
  })
}

function init(callback, aPool) {
  pool = aPool || new Pool(config)
  eventProducer = new pge.eventProducer(pool, 'teams', 'id')
  var query = 'CREATE TABLE IF NOT EXISTS teams (id text primary key, etag text, data jsonb)'
  pool.connect(function(err, client, release) {
    if(err)
      console.error('error creating teams table', err)
    else
      client.query(query, function(err, pgResult) {
        if(err) {
          release()
          console.error('error creating teams table', err)
        } else {
          query = "CREATE INDEX IF NOT EXISTS inxmembers ON teams USING gin ((data->'members'));"
          client.query(query, function(err, pgResult) {
            if(err) {
              release()
              console.error('error creating inmembers index on teams', err)
            } else {
              release()
              console.log('teams-pg: connected to PG')
              eventProducer.init(callback)
            }
          })
        }
      })
  })
}

process.on('unhandledRejection', function(e) {
  console.log(e.message, e.stack)
})

exports.createTeamThen = createTeamThen
exports.updateTeamThen = updateTeamThen
exports.deleteTeamThen = deleteTeamThen
exports.withTeamDo = withTeamDo
exports.withTeamsForUserDo = withTeamsForUserDo
exports.init = init