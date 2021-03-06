export IPADDRESS="127.0.0.1"
export PORT=3200
export COMPONENT_NAME="test-edge-simplified script"
export SPEEDUP=10
export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT="3200"
export EXTERNAL_SCHEME="http"

export AUTH_URL="https://google.login.apigee.com/oauth/token"
export AUTH_BASIC_CREDENTIALS="ZWRnZWNsaTplZGdlY2xpc2VjcmV0" #$(echo -n 'desiredcli:desiredclisecret' | base64)
export ISSUER="https://google.login.apigee.com"
export OAUTH_CALLBACK_URL="http://localhost:3200/oauth-callback"
export SSO_CLIENT_ID="permissionsclientlocal"
export SSO_CLIENT_SECRET="permissionsclientlocal"
export SSO_AUTHORIZATION_URL="https://google.login.apigee.com/oauth/authorize"

export PERMISSIONS_CLIENTID="permissions-client"
export PERMISSIONS_CLIENTSECRET=$(cat "$HERE/secrets/permissions_clientsecret.txt")
export PERMISSIONS_CLIENT_GRANT_TYPE="client_credentials"

export USER1_ID="mnally@apigee.com"
export USER1_SECRET=$(cat "$HERE/secrets/user1_secret.txt")
export USER1_GRANT_TYPE="password"

export USER2_ID="mnally+1@apigee.com"
export USER2_SECRET=$(cat "$HERE/secrets/user2_secret.txt")
export USER2_GRANT_TYPE="password"

export USER3_ID="mnally+2@apigee.com"
export USER3_SECRET=$(cat "$HERE/secrets/user3_secret.txt")
export USER3_GRANT_TYPE="password"

export USER4_ID="mnally+3@apigee.com"
export USER4_SECRET=$(cat "$HERE/secrets/user4_secret.txt")
export USER4_GRANT_TYPE="password"
