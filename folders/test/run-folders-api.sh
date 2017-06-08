export IPADDRESS="127.0.0.1"
export PORT=3012
export COMPONENT_NAME="folders"
export SPEEDUP=10
export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT="8080"
export INTERNAL_SY_ROUTER_HOST="localhost"
export INTERNAL_SY_ROUTER_PORT="8080"

source test/local-export-pg-connection-variables.sh
node folders.js