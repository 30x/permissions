'use strict'
const http = require('http')
const url = require('url')
const rLib = require('@apigee/response-helper-functions')
const lib = require('@apigee/http-helper-functions')
const Pool = require('pg').Pool;
const microServices = [
  require('./permissions/permissions.js'),
  require('./permissions-maintenance/permissions-maintenance.js'),
  require('./permissions-audit/audit.js'),
  require('./permissions-migration/permissions-migration.js'),
  require('./teams/teams.js'),
  require('./directories/directories.js'),
  require('./names/entries.js')
]

const config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
}
const pool = new Pool(config)

const COMPONENT_NAME = 'permissions-allinone'

const CHECK_PERMISSIONS = !(process.env.CHECK_PERMISSIONS == 'false')
const CHECK_IDENTITY = CHECK_PERMISSIONS || process.env.CHECK_IDENTITY == 'true'
const AUTH_KEY_URL = process.env.AUTH_KEY_URL
const OAUTH_CALLBACK_URL = process.env.OAUTH_CALLBACK_URL
if (!OAUTH_CALLBACK_URL) {
  console.log('OAUTH_CALLBACK_URL not set')
  process.exit(1)
}
const OAUTH_CALLBACK_PATHNAME = url.parse(OAUTH_CALLBACK_URL).pathname
const logger = new (require('@apigee/logger').Logger)(COMPONENT_NAME)

function log(functionName, text) {
  console.log((new Date()).toISOString(), COMPONENT_NAME, functionName, text)
}

const routes = []

function primRequestHandler(req, res, parsedRequestURL) {
  if (!req.headers['x-request-id'])
    req.headers['x-request-id'] = rLib.uuidw(16,0)
  var loggingContext = lib.getContext(req)
  logger.info('requestHandler', loggingContext, `method=${req.method} url=${req.url}`)
  for (let i = 0; i < routes.length; i++) {
    if (parsedRequestURL.pathname.startsWith(routes[i].path))
      return routes[i].microService.requestHandler(req, res)
  }
  rLib.notFound(res, `permissions allinone: //${req.headers.host}${req.url} not found`)
}

function requestHandler(req, res) {
  let parsedRequestURL = url.parse(req.url)
  if (parsedRequestURL.pathname == OAUTH_CALLBACK_PATHNAME)
    lib.authorize(req, res)
  else
    lib.validateTokenThen(req, res, null, (isValid, reason) => {
      if (isValid)
        primRequestHandler(req, res, parsedRequestURL)
      else
        rLib.unauthorized(res, {msg: 'must provide valid Bearer token', reason: reason})
  })
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
