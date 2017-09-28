#!/bin/bash

MYDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

. $MYDIR/../server-env.sh || exit 1

node $MYDIR/../../permissions-allinone.js