DIR=`pwd`
SOURCE_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)
cd $SOURCE_DIR

export IPADDRESS="127.0.0.1"
export PORT=3200

export AUTH_URL="https://google.login.apigee.com/oauth/token"
export ISSUER="https://google.login.apigee.com"

export PERMISSIONS_CLIENTID="permissions-client"
export PERMISSIONS_CLIENTSECRET=$(cat "$SOURCE_DIR/../../secrets/permissions_clientsecret.txt")

export BOOTSTRAP_USER_ID="mnally@apigee.com"
export BOOTSTRAP_USER_SECRET=$(cat "$SOURCE_DIR/../../secrets/user1_secret.txt")

export PERMISSIONS_BASE=${PERMISSIONS_BASE:-"https://permissions-allinone.e2e.apigee.net"}
export GLOBAL_GOVS=`cat global-governors.txt`
export AUTH_BASIC_CREDENTIALS="ZWRnZWNsaTplZGdlY2xpc2VjcmV0" #$(echo -n 'desiredcli:desiredclisecret' | base64)
export USER_TOKEN=$(curl -s -d "grant_type=password" --data-urlencode "username=${BOOTSTRAP_USER_ID}" --data-urlencode "password=${BOOTSTRAP_USER_SECRET}" $AUTH_URL -H "Authorization: Basic ${AUTH_BASIC_CREDENTIALS}" -H "Content-Type: application/x-www-form-urlencoded;charset=utf-8" -H "accept: application/json;charset=utf-8" | jq -r ."access_token")
export CLIENT_TOKEN=$(curl -s -d "grant_type=client_credentials" --data-urlencode "client_id=${PERMISSIONS_CLIENTID}" --data-urlencode "client_secret=${PERMISSIONS_CLIENTSECRET}" $AUTH_URL -H "Content-Type: application/x-www-form-urlencoded;charset=utf-8" -H "accept: application/json;charset=utf-8" | jq -r ."access_token")
python ../init-permissions.py

cd $DIR