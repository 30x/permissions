#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APPDIR=${DIR}/app

PREFIX=apigee-
APPLICATION=permissions-allinone
COMBINED=${PREFIX}${APPLICATION}
echo "Application: ${COMBINED}"

# Clean app dir
mkdir -p ${APPDIR}
rm -rf ${APPDIR}/*

cp -r ${DIR}/../../package.json ${APPDIR}
cp -r ${DIR}/../../permissions-allinone.js ${APPDIR}
cp -r ${DIR}/../../permissions ${APPDIR}
cp -r ${DIR}/../../permissions-audit ${APPDIR}
cp -r ${DIR}/../../permissions-maintenance ${APPDIR}
cp -r ${DIR}/../../permissions-migration ${APPDIR}
cp -r ${DIR}/../../teams ${APPDIR}
cp -r ${DIR}/../../folders ${APPDIR}


# Get all of our dependencies and make sure NPM gets their dependencies
printf "Running npm install\n"
cd ${APPDIR}
npm install


# Clean old package archive files
printf "Cleaning old package: ${DIR}/${COMBINED}.tar.gz\n"
rm -r "${DIR}/${COMBINED}.tar.gz"

# Create new package archive files
printf "Creating new package: ${COMBINED}.tar.gz package\n"
SOURCE="${DIR}/${COMBINED}.tar.gz"
cd ${DIR}
tar -zcf ${SOURCE} app lib package source token

printf "Done. Created Successfully: ${SOURCE}\n"
