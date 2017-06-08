# Overview 

Permissions-maintenance.js implements the API for managing permissions, but does not interpret them. permissions-maintenance.js relies on permissions.js to
find out who has permissions to change permissions. In other words, permissions-maintenance.js uses permissions.js in the same way any other application would.

The API exposed by permissions-maintenance.js includes the following:

* CRUD methods for permissions
* get a list of users who can see a resource
* get a list of resources that directly inherit permissions from a specified resource
* get the list of resources shared with a particular user

permissions-maintenance.js uses the permissions-maintenance-db.js library to access the permissions database directly.
