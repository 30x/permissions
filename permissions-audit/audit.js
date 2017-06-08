'use strict'
const http = require('http')
const url = require('url')
const lib = require('http-helper-functions')
const db = require('./audit-pg.js')
const pLib = require('permissions-helper-functions')
const rLib = require('response-helper-functions')
const querystring = require('querystring')

function getAuditEventsForScope(req, res, scope) {
  var requestingUser = lib.getUser(req.headers.authorization)
  pLib.ifAllowedThen(lib.flowThroughHeaders(req), res, scope, '_self', 'read', function() {
    db.withAuditEventsForScopeDo(res, scope, function (events) {
      var rslt = {
        self: req.url,
        isA: 'Collection',
        contents: events
      }
      rLib.found(res, rslt, req.headers.accept, rslt.self)
    })
  })
}

function requestHandler(req, res) {
  var req_url = url.parse(req.url)
  if (req_url.pathname == '/az-audit-events' && req_url.search)
    if (req.method == 'GET') {
      var qs = req_url.search.substring(1)
      var scope = querystring.parse(qs).scope
      if (scope)
        getAuditEventsForScope(req, res, scope)
      else
        rLib.badRequest(res, {msg: 'must provide scope'})
    } else
      rLib.methodNotAllowed(res, ['GET'])
  else
    rLib.notFound(res, `//${req.headers.host}${req.url} not found`)
}

function init(callback, aPool) {
  db.init(callback, aPool)
}

function run(){
  init(function(){
    var port = process.env.PORT
    http.createServer(requestHandler).listen(port, function() {
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
      paths: ['/az-audit-events'],
      init: init
    }
}

if (process.env.INTERNAL_SY_ROUTER_HOST == 'kubernetes_host_ip') 
  lib.getHostIPThen(function(err, hostIP){
    if (err) 
      process.exit(1)
    else {
      process.env.INTERNAL_SY_ROUTER_HOST = hostIP
      start()
    }
  })
else 
  start()
