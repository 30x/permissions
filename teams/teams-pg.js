'use strict'
const Pool = require('pg').Pool
const lib = require('http-helper-functions')
const pge = require('pg-event-producer')
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

function createTeamThen(req, id, selfURL, team, scopes, callback) {
  var query = 'INSERT INTO teams (id, etag, data) values($1, $2, $3) RETURNING etag'
  function eventData(pgResult) {
    return {url: selfURL, action: 'create', etag: pgResult.rows[0].etag, team: team, scopes: scopes}
  }
  eventProducer.queryAndStoreEvent(req, query, [id, lib.uuid4(), JSON.stringify(team)], 'teams', eventData, function(err, pgResult, pgEventResult) {
    callback(err, pgResult.rows[0].etag)
  })
}

function withTeamDo(req, id, callback) {
  pool.query('SELECT etag, data FROM teams WHERE id = $1', [id], function (err, pg_res) {
    if (err) {
      callback(500)
    }
    else {
      if (pg_res.rowCount === 0) { 
        callback(404)
      }
      else {
        var row = pg_res.rows[0]
        callback(null, row.data, row.etag)
      }
    }
  })
}

function withTeamsForUserDo(req, user, callback) {
  //var query = "SELECT id FROM teams, jsonb_array_elements(teams.data->'members') AS member WHERE member = $1"
  var query = "SELECT id FROM teams WHERE data->'members' ? $1"
  pool.query(query, [user], function (err, pg_res) {
    if (err) {
      callback(err)
    }
    else {
      callback(null, pg_res.rows.map(row => row.id))
    }
  })
}
    
function deleteTeamThen(req, id, selfURL, scopes, callback) {
  var query = 'DELETE FROM teams WHERE id = $1 RETURNING *'
  function eventData(pgResult) {
    return {url: TEAMS + id, action: 'delete', etag: pgResult.rows[0].etag, team: pgResult.rows[0].data, scopes: scopes}
  }
  eventProducer.queryAndStoreEvent(req, query, [id], 'teams', eventData, function(err, pgResult, pgEventResult) {
    if (err)
      callback(err)
    else
      callback(err, pgResult.rows[0].data, pgResult.rows[0].etag)
  })
}

function updateTeamThen(req, id, selfURL, patchedTeam, scopes, etag, callback) {
  var key = lib.internalizeURL(id, req.headers.host)
  var query, args
  if (etag) {
    query = 'UPDATE teams SET (etag, data) = ($1, $2) WHERE id = $3 AND etag = $4 RETURNING etag'
    args = [lib.uuid4(), JSON.stringify(patchedTeam), key, etag]
  } else {
    query = 'UPDATE teams SET (etag, data) = ($1, $2) WHERE id = $3 RETURNING etag'
    args = [lib.uuid4(), JSON.stringify(patchedTeam), key]
  }
  function eventData(pgResult) {
    return {url: selfURL, action: 'update', etag: pgResult.rows[0].etag, after: patchedTeam, scopes, scopes}
  }
  eventProducer.queryAndStoreEvent(req, query, args, 'teams', eventData, function(err, pgResult, pgEventResult) {
    if (err)
      callback(err)
    else
      if (pgResult.rowCount == 0)
        callback(404)
      else
        callback(err, pgResult.rows[0].etag)
  })
}

function withTeamMiscDo(req, id, callback) {
  pool.query('SELECT data FROM teams_misc WHERE id = $1', [id], function (err, pg_res) {
    if (err) {
      callback(500)
    }
    else {
      if (pg_res.rowCount === 0) { 
        callback(404)
      }
      else {
        var row = pg_res.rows[0]
        callback(null, row.data)
      }
    }
  })
}

function updateTeamMiscThen(req, id, patchedMisc, callback) {
  var key = lib.internalizeURL(id, req.headers.host)
  var query = 'UPDATE teams_misc SET (data) = ($1) WHERE id = $2'
  var args = [JSON.stringify(patchedMisc), key]
  pool.query(query, args, function (err, pgResult) {
    if (err) 
      callback({msg: `unable to read database entry for ${id} err: ${err}`})
    else
      callback(null)
  })
}

function init(callback, aPool) {
  pool = aPool || new Pool(config)
  eventProducer = new pge.eventProducer(pool)
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
              query = "CREATE TABLE IF NOT EXISTS teams_misc (id text primary key, data jsonb)"
              client.query(query, function(err, pgResult) {
                if(err) {
                  release()
                  console.error('error creating teams_misc table', err)
                } else {
                  query = "INSERT INTO teams_misc (id, data) values($1, $2)"
                  client.query(query, ['/az-well-known-teams', {}], function(err, pgResult) {
                    if (err) {
                      release()
                      if (err.code == '23505') {
                        console.log('teams-pg: /az-well-known-teams already existed')
                        console.log('teams-pg: connected to PG, config: ', config)
                        eventProducer.init(callback)
                      } else  
                        console.error('error adding /az-well-known-teams to teams_misc table', err)
                    } else {
                      release()
                      console.log('teams-pg: connected to PG, config: ', config)
                      eventProducer.init(callback)
                    }
                  })
                }
              })
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
exports.withTeamMiscDo = withTeamMiscDo
exports.updateTeamMiscThen = updateTeamMiscThen
exports.init = init