curl -X POST localhost:3001/permissions -d@perm-google.json | python -mjson.tool
curl -X POST localhost:3001/permissions -d@perm-maps.json | python -mjson.tool