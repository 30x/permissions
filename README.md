# Overview

The permissions repository is made up of 4 parts:

* permissions.js
* permissions-api.js
* permissions-db.js
* teams.js
* standard-functions.js

## permissions.js 

This application uses the permissions database to answer basic questions about users' rights to access resources.
The questions it can answer are:

* is the specified user allowed to perform the specified action on the specified resource?
* what actions is the specified user allowed to perform on the specified resource?

permissons.js runs as an independent HTTP service.

permissions.js uses the permissions-db.js library to access the permissions database directly. permissions.js only does GET requests on permissions.

permissions.js caches permissions. When permissions-api.js changes a permission, it creates and event in the database and posts it to /events. An instance 
of permissions.js will pick up the event, clear the cache entry, and propagate ethe event to the other instances. The instances also periodically look for
events in the database in case they missed any. 

## permisions-api.js 

Permissions-api.js implements the API for managing permissions, but does not interpret them. permissions-api.js relies on permissions.js to
find out who has permissions to change permissions. In other words, permissions-api.js uses permissions.js in the same way any other application would.

The API exposed by permissions-api.js includes the following:

* CRUD methods for permissions
* get a list of users who can see a resource
* get a list of resources that directly inherit permissions from a specified resource
* get the list of resources shared with a particular user

## permissions-db.js

This file encapsulates the database primitives for both permissions.js and permissions-api.js. It is designed to be used as a library.
Ideally it would be packaged as an npm module (TODO) 

## standard-functions.js

This file includes common methods for handling http requests. It is designed to be used as a library. It is used by the other 3.
Ideally it would be packaged as an npm module (TODO) 
