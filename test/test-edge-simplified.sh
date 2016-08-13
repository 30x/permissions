export IPADDRESS="127.0.0.1"
export PORT=3004
export PG_HOST="localhost"
export PG_USER="martinnally"
export PG_PASSWORD="martinnally"
export PG_DATABASE="permissions"
export COMPONENT="permissions"
export SPEEDUP=10

node drop.js
python test-edge-simplified.py