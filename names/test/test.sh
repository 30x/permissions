#!/bin/bash

MYDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

. $MYDIR/../test-env.sh || exit 1

#If not told otherwise, test-edge-simplified.py does a little initialization of the '/' permissions
#on the assumption that this has not been done. It you are running in an environment where permissions has
# been initialized — perhaps by running one of the scripts in /deployments — then uncomment the following line.
#PERMISSIONS_INITIALIZED="true"

x=`psql permissions -f $MYDIR/delete-directory-tables.txt`

python $MYDIR/test.py
