export IPADDRESS="127.0.0.1"
export PORT=3003
export COMPONENT_NAME="permissions"
export SPEEDUP=10
export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT="8080"
export INTERNAL_SY_ROUTER_HOST="localhost"
export INTERNAL_SY_ROUTER_PORT="8080"
export CACHE_SWEEP_INTERVAL=600000 # (will be divided by SPEEDUP)
export CACHE_ENTRY_TTL=600000 # (will be divided by SPEEDUP)

source ../local-export-pg-connection-variables.sh
#NODE_DEBUG=net
node permissions.js