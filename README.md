

The permissions application is uses the permissions database to answer basic questions about users' rights to access resources.
The questions it can answer are:

* is the specified user allowed to perform the specified action on the specified resource?
* what actions is the specified user allowed to perform on the specified resource?
* does a particular resource inherit permissions from any of a list of other resources?

permissons.js runs as an independent HTTP 'service'.

permissions.js uses the permissions-db.js library to access the permissions database directly. permissions.js only does GET requests on permissions.

permissions.js caches permissions and teams. It subscribes to change events for each in order to ensure cache currency. 
