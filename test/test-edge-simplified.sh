export IPADDRESS="127.0.0.1"
export PORT=3004
export COMPONENT="permissions"
export SPEEDUP=10
export EXTERNAL_ROUTER="localhost:8080"
export INTERNAL_ROUTER="localhost:8080"
export EXTERNAL_SCHEME="http"

source local-export-pg-connection-variables.sh
node drop.js
source renew-tokens.sh
python test-edge-simplified.py