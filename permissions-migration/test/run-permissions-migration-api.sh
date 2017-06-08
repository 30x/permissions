export IPADDRESS="127.0.0.1"
export PORT=3007
export COMPONENT_NAME="permissions-migration"
export SPEEDUP=10
export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT="8080"
export INTERNAL_SY_ROUTER_HOST="localhost"
export INTERNAL_SY_ROUTER_PORT="8080"
export EDGE_ADDRESS="https://api.e2e.apigee.net"
export PERMISSIONS_CLIENTID=${PERMISSIONS_CLIENTID:-defaultclient} # configure this in your shell when testing
export PERMISSIONS_CLIENTSECRET=${PERMISSIONS_CLIENTSECRET:-defaultsecret} # configure this in your shell when testing

source test/local-export-pg-connection-variables.sh
source ../set-migration-credentials.sh
node permissions-migration.js