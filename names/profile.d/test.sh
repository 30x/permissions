export IPADDRESS="127.0.0.1"
export PORT=3200
export COMPONENT_NAME="test-edge-simplified script"
export SPEEDUP=10
export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT="3200"
export EXTERNAL_SCHEME="http"

export AUTH_URL="https://login.e2e.apigee.net/oauth/token"
export AUTH_BASIC_CREDENTIALS="ZGVzaXJlZGNsaTpkZXNpcmVkY2xpc2VjcmV0"
export ISSUER="https://login.e2e.apigee.net"
export OAUTH_CALLBACK_URL="http://localhost:3200/oauth-callback"
export AUTH_KEY_URL="https://login.e2e.apigee.net/token_key"
export SSO_CLIENT_ID="permissionsclientlocal"
export SSO_CLIENT_SECRET="permissionsclientlocal"
export SSO_AUTHORIZATION_URL="https://login.e2e.apigee.net/oauth/authorize"

export PERMISSIONS_CLIENTID="permissions-client"
export PERMISSIONS_CLIENTSECRET="permissionsecret"
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

export USER4_ID="mnally@google.com"
export USER4_SECRET=$(cat "$HERE/secrets/user4_secret.txt")
export USER4_GRANT_TYPE="password"

export AZ_READ_CLIENT_ID="notifications-client"
export AZ_READ_CLIENT_SECRET="QsQpuuXBnmZUH5XT"
export AZ_READ_CLIENT_GRANT_TYPE="client_credentials"
