export IPADDRESS="127.0.0.1"
export PORT=3200

export AUTH_URL="https://login.e2e.apigee.net/oauth/token"
export AUTH_BASIC_CREDENTIALS="ZGVzaXJlZGNsaTpkZXNpcmVkY2xpc2VjcmV0"
export ISSUER="https://login.e2e.apigee.net"

export PERMISSIONS_CLIENTID="permissions-client"
export PERMISSIONS_CLIENTSECRET="permissionsecret"

export BOOTSTRAP_USER_ID="mnally@google.com"
export BOOTSTRAP_USER_SECRET="Apigee_user4"

export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT="3200"
export EXTERNAL_SCHEME="http"
export GLOBAL_GOVS=`cat global-governors.txt`
export AUTH_BASIC_CREDENTIALS=$(echo -n 'desiredcli:desiredclisecret' | base64)
export USER_TOKEN=$(curl -s -d "grant_type=password" --data-urlencode "username=${BOOTSTRAP_USER_ID}" --data-urlencode "password=${BOOTSTRAP_USER_SECRET}" $AUTH_URL -H "Authorization: Basic ${AUTH_BASIC_CREDENTIALS}" -H "Content-Type: application/x-www-form-urlencoded;charset=utf-8" -H "accept: application/json;charset=utf-8" | jq -r ."access_token")
export CLIENT_TOKEN=$(curl -s -d "grant_type=client_credentials" --data-urlencode "client_id=${PERMISSIONS_CLIENTID}" --data-urlencode "client_secret=${PERMISSIONS_CLIENTSECRET}" $AUTH_URL -H "Content-Type: application/x-www-form-urlencoded;charset=utf-8" -H "accept: application/json;charset=utf-8" | jq -r ."access_token")

python ../init-permissions.py