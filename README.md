# Overview

The permissions repository is made up of 4 parts:

* permissions.js
* permissions-api.js
* permissions-db.js
* teams.js

## permissions.js 

This file uses the permissions database to answer basic questions about users' rights to access resources.
The questions is can answer are:

* is the specified user allowed to perform the specified action on the specified resource?
* what actions is the specified user allowed to perform on the specified resource?
* what resources have been explicitly shared with the specified user or a team the user belongs to?

permissons.js could be run as an independent HTTP service. Currently its URLs are exposed through permisions-api.js. Creating a separate server would require
permissions-api.js to make HTTP calls to permissions.js, which is not hard but hasn't been written.

permissions.js uses the permissions-db.js library to access the permissions database directly. permissions.js only does GET requests on permissions.

permissions.js caches permissions. When permissions-api.js changes a permission, it calls invalidate() on permissions.js. Right now there is no distributed
cache-invalidation logic, so there has to be exactly one copy of permissions.js. This will be changed shortly.

## permisions-api.js 

Currently permissions.js exposes two separate APIs:

* a CRUD API for maintaining permissions
* the permissions.js API for checking permissions

The management API uses the permissions-checking API. Currently it does so as a library call—in the future it may use HTTP.

## permissions-db.js

This file encapsulates the database primitives for both permissions.js and permissions-api.js. It is designed to be used as a library.
Ideally it would be packaged as an npm module (TODO) 

## standard-functions.js

This file includes common methods for handling http requests. It is designed to be used as a library. It is used by the other 3.
Ideally it would be packaged as an npm module (TODO) 
