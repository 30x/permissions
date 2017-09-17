export IPADDRESS="127.0.0.1"
export PORT=3012
export COMPONENT_NAME="directories"
export SPEEDUP=10
export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT="8080"
export INTERNAL_SY_ROUTER_HOST="localhost"
export INTERNAL_SY_ROUTER_PORT="8080"
export CHECK_PERMISSIONS="false"

MYDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "cd into ${MYDIR}/.."
cd "${MYDIR}/.."

PG_VAR_FILE="${MYDIR}/../../local-export-pg-connection-variables.sh"

if [[ -f "$PG_VAR_FILE" ]]; then
    echo "Sourcing in ${PG_VAR_FILE}"
    source "$PG_VAR_FILE" || exit 1
else
    echo "Please create a file called local-export-pg-connection-variables.sh in auth dir"
	exit 1
fi

node directories.js