const https = require('https')

const clientId = process.env.PERMISSIONS_CLIENTID || 'permissions-client'
const clientSecret = process.env.PERMISSIONS_CLIENTSECRET || 'permissionsecret'

var clientAuthEncoded = new Buffer(clientId + ':' + clientSecret).toString('base64')
var headers = {
  Accept: 'application/json',
  'Content-Type': 'application/x-www-form-urlencoded',
  authorization: 'Basic ' + clientAuthEncoded
}
body = 'grant_type=client_credentials'
headers['Content-Length'] = Buffer.byteLength(body)
var options = {
  hostname: process.env.hostname || 'login.e2e.apigee.net',
  path: '/oauth/token',
  method: 'POST',
  headers: headers,
  rejectUnauthorized: false // TODO make this configurable. used because apigee doesn't generate certs properly
}
var clientReq = https.request(options, function (client_res) {
  client_res.setEncoding('utf8')
  var body = ''
  client_res.on('data', chunk => body += chunk)
  client_res.on('end', function() {
    if (client_res.statusCode == 200)  {
      var rslt = JSON.parse(body)
      console.log(rslt.access_token)
      process.exit(0)
    } else {
      console.log(`unable to send event to: ${process.env.hostname} statusCode: ${client_res.statusCode}`)
      process.exit(-1)
    }
  })
})
clientReq.on('error', function (err) {
  console.log(`sendHttpRequest: error ${err}`)
  return -1
})
if (body) clientReq.write(body)
  clientReq.end()