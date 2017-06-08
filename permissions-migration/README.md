# Overview

A service for migrating Edge roles into the permissions service.  Currently supports
only migrating the default Edge roles and permissions.

# Running

In order for this service to work properly, the following ENV variables must be available with valid values:  

`EDGE_ADDRESS`  
`PERMISSIONS_CLIENTID`  
`PERMISSIONS_CLIENTSECRET`  


# Testing

The python test script will only work after you run run `renew-tokens.sh` in the test directory and replace 
the values in the `token` txt files first.