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

### Clone and initialize the 4 components of the permissions service
* Follow the instructions at go/github to get connected to github
* git clone git@github.com:30x/permissions.git
* git clone git@github.com:30x/permissions-maintenance.git
* git clone git@github.com:30x/permissions-migration.git
* git clone git@github.com:30x/teams.git
* execute `npm install` in each of these directories
* optionally clone 30x/http-helper-functions, execute `npm link` in that directory, and execute `npm link http-helper-functions` where it is used. Same for 30x/permissions-helper-functions, 30x/pg-event-producer and 30x/pg-event-consumer 
* source local-export-pg-connection-variables.sh will set up environment variables for PG
* execute ./test/run-... in each of these directories, each in a different shell window

### install and configure nginx
* brew install nginx
* nginx (starts in the background)
* cp nginx.conf /Users/mnally/homebrew/etc/nginx/nginx.conf (executed from this test directory. nginx -V will show the location from which nginx is loading nginx.conf)
* nginx -s reload

### install prereqs and run the tests
* sudo easy_install requests (this python egg is used by the test script)
* source renew-tokens.sh
* in the test subdirectory, enter ./test-edge-simplified.sh

### install prereqs and run the demo
* brew install gettext
* brew link --force gettext
* source renew-prod-token.sh
* ./edge-simulation-demo.sh
* ./docstore-org-simulation-demo.sh
* ./docstore-personal-simulation-demo.sh

It is also possible to run the 4 permissions applications on minikube (a local kubernetes environment).
To do this, install Docker tools, virtualbox and minikube. There is also a configuration using `docker for mac`, minikube and
xhyve (osx built-in hypervisor) that should work, but I have not tried it. Having installed these prereqs, you
should be able to do the following:
* run ./docker_build.sh in each of the 4 repo directories
* run the k8s-start.sh and k8s-restart.sh scripts.

