export IPADDRESS="127.0.0.1"
export PORT=3004
export COMPONENT="permissions"
export SPEEDUP=10
export EXTERNAL_ROUTER="sso.k8s.local:30555"
export INTERNAL_ROUTER="internal-router"
export EXTERNAL_SCHEME="http"

source local-export-pg-connection-variables.sh
node delete-test-data.js
echo "deleted test data"
source renew-tokens.sh
python test-edge-simplified.py