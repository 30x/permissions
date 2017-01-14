var Stats = require('fast-stats').Stats

require('fs').readFile('dev_timings-o-1d97c350-580e-41f2-be07-e1183d2a45f7.json', (err, data) => {
  if (err)
    console.log(err)
  else {
    numbers = JSON.parse(data)
    var s = new Stats().push(numbers)
    console.log('mean:', s.amean().toFixed(4))    
    console.log('gmean:', s.gmean().toFixed(4))    
    console.log('50th percentile:', s.percentile(50).toFixed(4))    
    console.log('90th percentile:', s.percentile(90).toFixed(4))    
    console.log('99th percentile:', s.percentile(99).toFixed(4))    
    console.log('range:', s.range())    
  }
})