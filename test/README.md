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
* create a /secrets directory, with a file for each secret. To do this, copy the entire /secrets-valentine-links directory as /secrets. Then use the link in each file to get the value from valentine. Replave the link with the value.
* execute ./test/run-permissions-allinone.sh in the root directory

### install prereqs and run the tests
* sudo easy_install requests (this python egg is used by the test script)
* in the test subdirectory, enter ./test-edge-simplified.sh

If the tests execute correctly, you should see output like this:

start delete test data: host: 127.0.0.1 database: permissions
setConsumers: consumers: [ '127.0.0.1:3200' ]
2017-10-18T19:34:11.512Z test-edge-simplified script http-helper-functions:sendRequest id: lhdgfgpfjnoeanaf method: POST hostname: undefined url: /oauth/token
2017-10-18T19:34:12.200Z test-edge-simplified script http-helper-functions:sendRequest id: lhdgfgpfjnoeanaf received response after 687 millisecs. method: POST hostname: google.login.apigee.com url: /oauth/token
2017-10-18T19:34:12.203Z test-edge-simplified script withValidClientToken retrieved token for: permissions-client
removed all test data from permissions table on 127.0.0.1
2017-10-18T19:34:12.269Z test-edge-simplified script http-helper-functions:sendRequest id: okegjcfmabdgdjhd method: POST hostname: undefined url: /oauth/token
2017-10-18T19:34:12.365Z test-edge-simplified script http-helper-functions:sendRequest id: okegjcfmabdgdjhd received response after 96 millisecs. method: POST hostname: google.login.apigee.com url: /oauth/token
2017-10-18T19:34:12.366Z test-edge-simplified script withValidClientToken retrieved token for: permissions-client
removed all test data from teams table on 127.0.0.1
pg-event-producer finalizing
component: test-edge-simplified script, sent event 7531 to 127.0.0.1:3200 index: 7531
component: test-edge-simplified script, sent event 7532 to 127.0.0.1:3200 index: 7532
retrieved password token for mnally@apigee.com
retrieved password token for mnally+1@apigee.com
retrieved password token for mnally+2@apigee.com
retrieved password token for mnally+3@apigee.com
retrieved client_credentials token for permissions-client
correctly retrieved /az-permissions?/ etg: 1
correctly patched /az-permissions?/
sending requests to http://localhost:3200
correctly created permissions url: http://localhost:3200/az-permissions?http://apigee.com/o/acme etag: ba4e38c5-8e74-4f7f-8708-984c68c226e8
correctly retrieved allowed-actions for https://google.login.apigee.com#67b0350f-45dd-4309-8b36-36e707624f90 on http://apigee.com/o/acme
correctly retrieved allowed-actions for https://google.login.apigee.com#1254db5c-e5af-45e1-b8b5-ea06610356b2 on http://apigee.com/o/acme
...
correctly returned allowed-actions ([u'read']) of http://apigee.com/o/acme/environments/test for USER3 after update of role. Elapsed time = 14.6858692169ms
correctly created team /az-tm-biotype-dogy-7cc6254f32286345a6f87102 etag: 3cb80056-023d-4916-b1f0-be275c609e2a
correctly patched Email Team team to add user2
finished test suite

Each time you run the test script, it will begin by removing the data from any previous run.

### install prereqs and run the demo
* brew install gettext
* brew link --force gettext
* ./edge-simulation-demo.sh
* ./docstore-org-simulation-demo.sh
* ./docstore-personal-simulation-demo.sh
