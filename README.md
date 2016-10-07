# Permissions Service

The overall "Permissions Service" is made up of 4 microservices that work together

* The permissions-maintenance microservice
* The teams micro-service
* The permissions-migration microservice
* The permissions microservice 

## Permissions-maintenance microservice

This microservice is a CRUD+ application that is used to create and maintain the individual permissions documents. There must be a permissions resource for each and every resource
that the permissions service controls.

This microservice is designed to work at "maintenance scale", not "runtime scale". It is used when data is maintained, and is used by the runtime to load caches,
but is not involved in request-by-request runtime processing.

In addition to basic CRUD, the permissions-maintenance microservice implements some useful queries for permissions hierarchy navigation and understanding, such as 
* /resources-shared-with?{user}
* /permissions-heirs?{resource}
* /users-who-can-access?{resource}

## Teams microservice

The teams microservice is a CRUD+ application used to maintain teams. A team is a simple list of users. Teams within teams are not supported

The permissions-maintenance microservice is designed to work at "maintenance scale", not "runtime scale". It is used when data is maintained, and is used by the runtime to load caches,
but is not involved in request-by-request runtime processing.

## permissions-migration microservice

This microservice is designed to load data from the Edge RBAC system on demand into the permissions database so that the permissions service can answer questions for Edge resources without requiring any manual migration from Edge.

This microservice is called by the permissions runtime if a request is made for a resource for which the permissions service has no information. The migration microservice
will look at the resource URL to see if it might be an Edge resource for an org that has not yet been migrated. If so it will migrate. More typically, it will do nothing.

## Permissions microservice 

The permissions microservice is the runtime portion of the overall Permissions service.
The primary questions it answers is:

* is the specified user allowed to perform the specified action on the specified resource?

This question is asked on every HTTP request received by every application that uses the permissions service for access control. the permissions-maintenance and teams applications themselves use this.

The permissions microservice is designed to work primarily from in-memory data. It will access [the database of] the permissons-maintenance microservice to fetch data when it has a cache miss.
It also accesses the teams service to get the list of teams for a given user when there is a cache miss. Currently, information only drops out the cache as a result of invalidation events, although
we may implement a TTL in the future.

### Cache invalidation

All instances of the permissions microservice register their IP addresses in the listeners table in the permissions/teams database at regular intervals. Whenever the permissions-maintenance or teams applications
create or modify an entity in the database, they do 3 things:

* write the change to the permissions/teams tables in the database
* write an event to event table. Events are sequentially numbered
* broadcast the event to all listeners in the listeners table

Each instance of the permissions microservice keeps track of the events it has received. Periodically it will look in the events table to see if there are any new events, beginning with the first
one it hasn't yet seen. This ensures that if it missed the broadcast of an event for any reason, it will pick it up soon thereafter.

Old events are periodically garbage-collected. Listeners that have not recently re-registered are removed from the listeners table.

# Local Testing

See the test directory for instructions on how to run the permissions service as a set of local processes for developent/debug. See the Shipyard-deployment project for instructions on how
to do the same thing using a local Kubernetes.

