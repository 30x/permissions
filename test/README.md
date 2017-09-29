The permissions service can be run locally as a single process. 

[Permissions can also run as 4 or 5 processes and an Nginx router. This capability is not being used at the moment, but may be important in the future.]

You will need a postgres with a database called permissions. The applications will create the tables themselves. If you want to use the shell scripts unmodified, you should create
a user whose name and password are the same as those in the file local-export-pg-connection-variables.sh

Here are the steps I went through to get this going on my new Google machine:

### Intall and configure Postgres
* brew install postgres
* createdb $(whoami)
* psql (just to verify it works)
* createuser -P martinnally (when prompted for password, use martinnally). Alternatively create the user of your choice and modify the test script local-export-pg-connection-variables.sh to use it. 
* createdb permissions

### Clone and initialize the permissions service
* git clone sso://edge-internal/permissions
* execute `npm install` in the root directory of the repository
* optionally clone 30x/http-helper-functions, execute `npm link` in that directory, and execute `npm link http-helper-functions` where it is used. Repeat for 30x/response-helper-functions, 30x/permissions-helper-functions, 30x/pg-event-producer and 30x/pg-event-consumer 
* create local-export-pg-connection-variables.sh will set up environment variables for PG
* create local-export-system-variables.sh
* execute ./test/run-permissions-allinone.sh in the root directory

An example local-export-pg-connection-variables.sh looks loime this:
```bash
export PG_HOST="127.0.0.1"
export PG_USER="martinnally"
export PG_PASSWORD="martinnally"
export PG_DATABASE="permissions" 
```

An example local-export-system-variables.sh looks like this:
```bash
export IPADDRESS="127.0.0.1"
export PORT=3200
export COMPONENT_NAME="permissions"
export SPEEDUP=10
export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT="3200"
export INTERNAL_SY_ROUTER_HOST="localhost"
export INTERNAL_SY_ROUTER_PORT="3200"
export EXTERNAL_SCHEME="http"

export AUTH_URL="https://login.e2e.apigee.net/oauth/token"
export AUTH_BASIC_CREDENTIALS="ZGVzaXJlZGNsaTpkZXNpcmVkY2xpc2VjcmV0"
export ISSUER="https://login.e2e.apigee.net"
export OAUTH_CALLBACK_URL="http://localhost:3200/oauth-callback"
export SSO_CLIENT_ID="permissionsclientlocal"
export SSO_CLIENT_SECRET="permissionsclientlocal"
export SSO_AUTHORIZATION_URL="https://login.e2e.apigee.net/oauth/authorize"

export PERMISSIONS_CLIENTID="permissions-client"
export PERMISSIONS_CLIENTSECRET="*****"
export PERMISSIONS_CLIENT_GRANT_TYPE="client_credentials"

export USER1_ID="mnally@apigee.com"
export USER1_SECRET="*****"
export USER1_GRANT_TYPE="password"

export USER2_ID="mnally+1@apigee.com"
export USER2_SECRET="*****"
export USER2_GRANT_TYPE="password"

export USER3_ID="mnally+2@apigee.com"
export USER3_SECRET="*****"
export USER3_GRANT_TYPE="password"

export USER4_ID="mnally@google.com"
export USER4_SECRET="*****"
export USER4_GRANT_TYPE="password"

export AZ_READ_CLIENT_ID="notifications-client"
export AZ_READ_CLIENT_SECRET="*****"
export AZ_READ_CLIENT_GRANT_TYPE="client_credentials"
```

### install prereqs and run the tests
* sudo easy_install requests (this python egg is used by the test script)
* in the test subdirectory, enter ./test-edge-simplified.sh

If the tests execute correctly, you should see output like this:

Sourcing in /Users/mnally/source/permissions/test/../local-export-pg-connection-variables.sh
Sourcing in file /Users/mnally/source/permissions/test/../local-export-system-variables.sh
start delete test data: host: 127.0.0.1 user: martinnally password: martinnally database: permissions
setConsumers: consumers: [ '127.0.0.1:3200' ]
removed all test data from permissions table on 127.0.0.1
removed all test data from teams table on 127.0.0.1
pg-event-producer finalizing
failed to send event 2693 to 127.0.0.1:3200 err: unable to send event to: 127.0.0.1:3200 statusCode: 401
failed to send event 2692 to 127.0.0.1:3200 err: unable to send event to: 127.0.0.1:3200 statusCode: 401
retrieved password token for mnally@apigee.com
retrieved password token for mnally+1@apigee.com
retrieved password token for mnally+2@apigee.com
retrieved password token for mnally@google.com
retrieved client_credentials token for permissions-client
retrieved client_credentials token for notifications-client
correctly retrieved /az-permissions?/ etg: 71fdcc14-f377-4dfa-aa11-53c177948948
correctly patched /az-permissions?/
sending requests to http://localhost:3200
correctly created permissions url: http://localhost:3200/az-permissions?http://apigee.com/o/acme etag: deb282d2-bab2-4e72-b69b-383d641ab36b
correctly retrieved allowed-actions for https://login.e2e.apigee.net#6ff95057-7b80-4f57-bfec-c23ec5609c77 on http://apigee.com/o/acme
correctly retrieved allowed-actions for https://login.e2e.apigee.net#81325ff1-32e9-4f50-b5c5-8923e3dc244a on http://apigee.com/o/acme
...
correctly returned allowed-actions ([u'read']) of http://apigee.com/o/acme/environments/test for USER3 after update of role. Elapsed time = 12.7611160278ms
correctly created team /az-tm-fleabane-ceremony-32fe1e8aa88d5bd491e23791 etag: 9a63fc53-668e-4f6f-bcb9-367aa137e690
correctly patched Email Team team to add user2
finished test suite

Each time you run the test script, it will begin by removing the data from any previous run.

### install prereqs and run the demo
* brew install gettext
* brew link --force gettext
* ./edge-simulation-demo.sh
* ./docstore-org-simulation-demo.sh
* ./docstore-personal-simulation-demo.sh
