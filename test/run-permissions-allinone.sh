
echo ${WORKING_DIR}
export IPADDRESS="127.0.0.1"
export PORT=3200
export COMPONENT_NAME="permissions-allinone"
export SPEEDUP=10
export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT=${1:-"3200"}
export INTERNAL_SY_ROUTER_HOST="localhost"
export INTERNAL_SY_ROUTER_PORT=${1:-"3200"}
export CACHE_SWEEP_INTERVAL=600000 # (will be divided by SPEEDUP) export CACHE_ENTRY_TTL=600000 # (will be divided by SPEEDUP)
export EDGE_ADDRESS="https://api.e2e.apigee.net"
# temporary hack - using the same clientID for migration to access edge and for team to access permissions
export PERMISSIONS_CLIENTID=$PERMISSIONS_CLIENTID # configure this in your shell when testing
export PERMISSIONS_CLIENTSECRET=$PERMISSIONS_CLIENTSECRET # configure this in your shell when testing
export CLIENT_TOKEN_ISSUER="https://login.e2e.apigee.net"

MYDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "cd into ${MYDIR}/.."
cd "${MYDIR}/.."

PG_VAR_FILE="${MYDIR}/../local-export-pg-connection-variables.sh"
if [[ -f "$PG_VAR_FILE" ]]; then
    echo "Sourcing in ${PG_VAR_FILE}"
    source "$PG_VAR_FILE" || exit 1
else
    echo "Please create a file called local-export-pg-connection-variables.sh in parent dir of permissions (${MYDIR}/../)"
	exit 1
fi

EXPORT_VAR_FILE="${MYDIR}/../export-e2e-variables.sh"
if [[ -f "$EXPORT_VAR_FILE" ]]; then
	echo "Sourcing in file $EXPORT_VAR_FILE"
	source $EXPORT_VAR_FILE || exit 1
else
    echo "Please create a file called export-e2e-variables.sh in parent dir of permissions (${MYDIR}/../)"
	exit 1
fi

#NODE_DEBUG=net
node permissions-allinone.js
