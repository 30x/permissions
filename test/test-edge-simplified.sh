export WORKING_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

export IPADDRESS="127.0.0.1"
export PORT=3004
export COMPONENT_NAME="permissions"
export SPEEDUP=10
export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT="3200"
export INTERNAL_SY_ROUTER_HOST="localhost"
export INTERNAL_SY_ROUTER_PORT="8080"
export EXTERNAL_SCHEME="http"

source $WORKING_DIR/../local-export-pg-connection-variables.sh
node $WORKING_DIR/delete-test-data.js
#source renew-tokens.sh
python $WORKING_DIR/test-edge-simplified.py
