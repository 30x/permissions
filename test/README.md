The permissions service can be run locally by running 4 processes and an Nginx router. An example nginx config file for the purpose is in this directory (nginx.conf).
On OSX, you can copy it to /usr/local/etc/nginx/ and run nginx. See the Nginx documentation for other operating systems and other options. 

Each of the following repos has a test directory containg a bash file whose name is of the form run-xxxxxxx. This bash file is expected to be run from the root as ./test/run-xxxxxxx

You will need a postgres with a database called permissions. The applications will create the tables themselves. If you want to use the shell scripts unmodified, you should create
a user whose name and password are the same as those in the file local-export-pg-connection-variables.sh