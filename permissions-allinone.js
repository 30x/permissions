'use strict'
const http = require('http')
const url = require('url')
const rLib = require('@apigee/response-helper-functions')
const Pool = require('pg').Pool;
const microServices = [
  require('./permissions/permissions.js'),
  require('./permissions-maintenance/permissions-maintenance.js'),
  require('./permissions-audit/audit.js'),
  require('./permissions-migration/permissions-migration.js'),
  require('./teams/teams.js'),
  require('./folders/folders.js')
]

const config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
}
const pool = new Pool(config)

const COMPONENT_NAME = 'permissions-allinone'

function log(functionName, text) {
  console.log(Date.now(), COMPONENT_NAME, functionName, text)
}

const routes = []

function requestHandler(req, res) {
  let req_url = url.parse(req.url)
  for (let i = 0; i < routes.length; i++) {
    if (req_url.pathname.startsWith(routes[i].path))
    return routes[i].microService.requestHandler(req, res)
  }
  rLib.notFound(res, `allinone: //${req.headers.host}${req.url} not found`)
}

function start() {
  let count = 0
  for (let i=0; i<microServices.length; i++) {
    let microService = microServices[i]
    for(let j=0; j < microServices[i].paths.length; j++) {
      let route = {}
      route['path'] = microServices[i].paths[j]
      route['microService'] = microServices[i]
      routes.push(route)
    }
    microService.init(function(err) {
    if (err)
      log(`failed to init microservice ${i}`, err)
    else
      if (++count == microServices.length) {
        let port = process.env.PORT
        http.createServer(requestHandler).listen(port, function() {
          log('start', `server is listening on ${port}`)
        })
      }
    }, pool)
  }
  routes.sort(function (routeA, routeB) {
    return routeB.path.length - routeA.path.length
  })
}

start()
