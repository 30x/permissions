export IPADDRESS="127.0.0.1"
export PORT=3013
export COMPONENT_NAME="all-in-one"
export SCHEME="http"
export AUTHORITY="localhost:${1:-3100}"
export BASE_RESOURCE="/"
export AUTHORITY="localhost:3200"
export WORKING_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"


EXPORT_VAR_FILE="${WORKING_DIR}/../../local-export-system-variables.sh"
if [[ -f "$EXPORT_VAR_FILE" ]]; then
	echo "Sourcing in file $EXPORT_VAR_FILE"
	source $EXPORT_VAR_FILE || exit 1
else
    echo "Please create a file called local-export-system-variables.sh in parent dir of permissions (${MYDIR}/../)"
	exit 1
fi

x=`psql permissions -f delete-directory-tables.txt`

python test.py
