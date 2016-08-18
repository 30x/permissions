export IPADDRESS="127.0.0.1"
export PORT=3004
export PG_HOST="localhost"
export PG_USER="martinnally"
export PG_PASSWORD="martinnally"
export PG_DATABASE="permissions"
export COMPONENT="permissions"
export SPEEDUP=10
export SYSTEM_HOST="sso.k8s.local"

node drop.js
source renew-tokens.sh
python test-edge-simplified.py