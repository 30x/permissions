curl -X POST localhost:8080/az-permissions -d@perm-google.json | python -mjson.tool
curl -X POST localhost:8080/az-permissions -d@perm-maps.json | python -mjson.tool
curl -X POST localhost:8080/az-permissions -d@perm-teams.json | python -mjson.tool