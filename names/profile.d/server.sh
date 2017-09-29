export IPADDRESS="127.0.0.1"
export PORT="3200"
export COMPONENT_NAME="permissions"
export SPEEDUP="10"
export INTERNAL_SY_ROUTER_HOST="localhost"
export INTERNAL_SY_ROUTER_PORT=${1:-"3200"}
export EXTERNAL_SCHEME="http"

export OAUTH_CALLBACK_URL="http://localhost:3200/oauth-callback"
export SSO_CLIENT_ID="permissionsclientlocal"
export SSO_CLIENT_SECRET=$(cat "$HERE/secrets/sso_client_secret.txt")
export SSO_AUTHORIZATION_URL="https://login.e2e.apigee.net/oauth/authorize"

export PERMISSIONS_CLIENTID="permissions-client"
export PERMISSIONS_CLIENTSECRET="permissionsecret"
export PERMISSIONS_CLIENT_GRANT_TYPE="client_credentials"
export AUTH_URL="https://login.e2e.apigee.net/oauth/token"

export EDGE_ADDRESS="https://api.e2e.apigee.net"

export CACHE_SWEEP_INTERVAL=600000 # (will be divided by SPEEDUP) export CACHE_ENTRY_TTL=600000 # (will be divided by SPEEDUP)

# temporary hack - using the same clientID for migration to access edge and for team to access permissions
#export PERMISSIONS_CLIENTID=$PERMISSIONS_CLIENTID # configure this in your shell when testing
#export PERMISSIONS_CLIENTSECRET=$PERMISSIONS_CLIENTSECRET # configure this in your shell when testing
#export CLIENT_TOKEN_ISSUER="https://login.e2e.apigee.net"
