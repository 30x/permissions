export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT="8080"
export INTERNAL_SY_ROUTER_HOST="localhost"
export INTERNAL_SY_ROUTER_PORT="8080"
export EXTERNAL_SCHEME="http"

source get_clientid_token.sh
python cleanup.py