#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

BUILD_TYPE="local"
if [[ -n $1 ]]; then
    BUILD_TYPE=$1
fi


if [ "${BUILD_TYPE}" = "rpm" ];then
    # do stuff here
    sh ${DIR}/rpm/package.sh
    exit 0
fi



