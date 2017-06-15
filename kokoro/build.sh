#!/bin/bash

ROOTDIR="${KOKORO_ARTIFACTS_DIR}/git/permissions"

# Execute the packaging script with type as RPM
${ROOTDIR}/build/build.sh rpm
