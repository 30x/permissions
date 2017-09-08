The permissions service can be run locally by running 4 processes and an Nginx router. An example nginx config file for the purpose is in this directory (nginx.conf).
On OSX, you can copy it to /usr/local/etc/nginx/ and run nginx. See the Nginx documentation for other operating systems and other options.
(nginx -V will display the location where nginx is currently looking for its config file.)

Each of the following repos has a test directory containg a bash file whose name is of the form run-xxxxxxx. This bash file is expected to be run from the root as ./test/run-xxxxxxx

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
* source local-export-pg-connection-variables.sh will set up environment variables for PG
* execute ./test/run-permissions-allinone.sh in the root directory

An example local-export-pg-connection-variables.sh looks loime this:
```bash
export PG_HOST="127.0.0.1"
export PG_USER="martinnally"
export PG_PASSWORD="martinnally"
export PG_DATABASE="permissions" 
```

### install prereqs and run the tests
* sudo easy_install requests (this python egg is used by the test script)
* create local-export-system-variables.sh
* in the test subdirectory, enter ./test-edge-simplified.sh

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
export AUTH_KEY_URL="https://login.e2e.apigee.net/token_key"
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

### install prereqs and run the demo
* brew install gettext
* brew link --force gettext
* ./edge-simulation-demo.sh
* ./docstore-org-simulation-demo.sh
* ./docstore-personal-simulation-demo.sh

It is also possible to run the 4 permissions applications on minikube (a local kubernetes environment).
To do this, install Docker tools, virtualbox and minikube. There is also a configuration using `docker for mac`, minikube and
xhyve (osx built-in hypervisor) that should work, but I have not tried it. Having installed these prereqs, you
should be able to do the following:
* run ./docker_build.sh in each of the 4 repo directories
* run the k8s-start.sh and k8s-restart.sh scripts.
