export IPADDRESS="127.0.0.1"
export PORT=3004
export COMPONENT_NAME="permissions"
export SPEEDUP=10
export EXTERNAL_SY_ROUTER_HOST="shipyard.e2e.apigee.net"
export EXTERNAL_SCHEME="https"

source ../../aws-export-pg-variables.sh
node delete-test-data.js
source ../../renew-tokens.sh
python test-edge-simplified.py