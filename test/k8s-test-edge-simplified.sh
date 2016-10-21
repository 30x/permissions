export IPADDRESS="127.0.0.1"
export PORT=3004
export COMPONENT="permissions"
export SPEEDUP=10
export EXTERNAL_ROUTER_HOST="sso.k8s.local"
export EXTERNAL_ROUTER_PORT="30555"
export INTERNAL_ROUTER_HOST="internal-router"
export EXTERNAL_SCHEME="http"

source local-export-pg-connection-variables.sh
node delete-test-data.js
echo "deleted test data"
source renew-tokens.sh
python test-edge-simplified.py