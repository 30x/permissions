export IPADDRESS="127.0.0.1"
export PORT=3004
export COMPONENT_NAME="permissions"
export SPEEDUP=10
export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT="8080"
export INTERNAL_SY_ROUTER_HOST="localhost"
export INTERNAL_SY_ROUTER_PORT="8080"
export EXTERNAL_SCHEME="http"

source local-export-pg-connection-variables.sh
python test.py