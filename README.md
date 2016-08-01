The permissions repository is made up of 4 parts:

* permissions.js
* permissions-api.js
* permissions-db.js
* teams.js

permissions.js 

This file uses the permissions database to answer basic questions about users' rights to access resources.
The questions is can answer are:

* is the specified user allowed to perform the specified action on the specified resource?
* what actions is the specified user allowed to perform on the specified resource?
* what resources have been explicitly shared with the specified user or a team the user belongs to?

permissons.js could be run as an independent HTTP service. Currently its URLs are exposed through permisions-api.js.

permissions.js uses the permissions-db.js library to access the permissions database directly.

permisions-api.js 

This application contains the CRUD methods for maintaining permissions.