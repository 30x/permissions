'use strict'
const http = require('http')

function requestHandler(req, res) {
  var hrstart = process.hrtime()
  if (req.url == '/timing')
    if (req.method == 'GET') {
      res.writeHead(200)
      res.end()
    }
    else {
      res.writeHead(405)
      res.end()        
    }
  else {
      res.writeHead(404)
      res.end()        
  }
  var hrend = process.hrtime(hrstart)
  console.log(`time: ${hrend[0]}s ${hrend[1]/1000000}ms`)
}

const port = 3030
http.createServer(requestHandler).listen(port, function() {
    console.log(`server is listening on ${port}`)
})
