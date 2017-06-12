#!/bin/bash

### DEFAULT after-install.sh CODE ###

APPLICATION_NAME=<%= name %>
APIGEE_ROOT="${RPM_INSTALL_PREFIX}"
RUN_USER=<%= run_user %>
RUN_GROUP=<%= run_group %>
VERSION=<%= version %>-<%= iteration %>
COMPONENT_ROOT=$APIGEE_ROOT/$APPLICATION_NAME-$VERSION

chown -R "$RUN_USER":"$RUN_GROUP" "$COMPONENT_ROOT"

rm -f "$APIGEE_ROOT/$APPLICATION_NAME"
ln -s "$COMPONENT_ROOT" "$APIGEE_ROOT/$APPLICATION_NAME" || exit 1
chown -h "$RUN_USER":"$RUN_GROUP" "$APIGEE_ROOT/$APPLICATION_NAME"

if [ -f "$COMPONENT_ROOT/init.d/$APPLICATION_NAME" ]; then
    rm -f "/etc/init.d/$APPLICATION_NAME"
    sed -i "s#APIGEE_ROOT=.*#APIGEE_ROOT=${APIGEE_ROOT}#g" "$COMPONENT_ROOT/init.d/$APPLICATION_NAME"
    ln -s "$COMPONENT_ROOT/init.d/$APPLICATION_NAME" "/etc/init.d/$APPLICATION_NAME" || exit 1
    chown -h "$RUN_USER":"$RUN_GROUP" "/etc/init.d/$APPLICATION_NAME"
fi

### END - DEFAULT after-install.sh CODE ###



### CUSTOM After-Upgrade Code --> ###



### END CUSTOM After-Upgrade Code --> ###

exit 0



