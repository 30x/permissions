export WORKING_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

PG_VAR_FILE="${WORKING_DIR}/../local-export-pg-connection-variables.sh"
if [[ -f "$PG_VAR_FILE" ]]; then
    echo "Sourcing in ${PG_VAR_FILE}"
    source "$PG_VAR_FILE" || exit 1
else
    echo "Please create a file called local-export-pg-connection-variables.sh in parent dir of permissions (${MYDIR}/../)"
	exit 1
fi

EXPORT_VAR_FILE="${WORKING_DIR}/../local-export-system-variables.sh"
if [[ -f "$EXPORT_VAR_FILE" ]]; then
	echo "Sourcing in file $EXPORT_VAR_FILE"
	source $EXPORT_VAR_FILE || exit 1
else
    echo "Please create a file called local-export-system-variables.sh in parent dir of permissions (${MYDIR}/../)"
	exit 1
fi

#If not told otherwise, test-edge-simplified.py does a little initialization of the '/' permissions
#on the assumption that this has not been done. It you are running in an environment where permissions has
# been initialized — perhaps by running one of the scripts in /deployments — then uncomment the following line.
#PERMISSIONS_INITIALIZED="true"

node $WORKING_DIR/delete-test-data.js
#source renew-tokens.sh
python $WORKING_DIR/test-edge-simplified.py
