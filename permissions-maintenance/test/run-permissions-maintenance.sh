export IPADDRESS="127.0.0.1"
export PORT=3001
export COMPONENT_NAME="permissions-maintenance"
export SPEEDUP=10
export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT="8080"
export INTERNAL_SY_ROUTER_HOST="localhost"
export INTERNAL_SY_ROUTER_PORT="8080"

source ../local-export-pg-connection-variables.sh
#NODE_DEBUG=net
node permissions-maintenance.js