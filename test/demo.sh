shopt -s extglob # Required to trim whitespace; see below
#read -n 1 -p "delete prior test data?"
./delete-test-data-local.sh &> /dev/null

#read -n 1 -p "continue to renew tokens?"
#source renew-tokens.sh

##
echo -e "\n\n\x1B[7m chapter 1 \x1B[27m\n\n" #clear
read -n 1 -p "continue to chapter 1 - basic permissions?"
permissions=$(cat << "EOF"
{
    "_subject": "http://apigee.com/o/acme", 
    "_self": 
        {"update": ["$APIGEE_USER1"], 
        "read": ["$APIGEE_USER1"], 
        "delete": ["$APIGEE_USER1"] 
        }, 
    "_permissions": 
        {"read": ["$APIGEE_USER1"], 
        "update": ["$APIGEE_USER1"] 
        },     
    "test-data": true
    }
EOF)
echo "permissions=$permissions"
command='echo $permissions | envsubst | curl http://localhost:8080/permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt' 
echo $command
read -n 1 -p "create these permissions?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_ORG_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
echo "permissions Etag: $ACME_ORG_PERMISSIONS_ETAG"
cat ttx.txt | python -mjson.tool

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/o/acme&user=$APIGEE_USER1" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER1 can perform on http://apigee.com/o/acme?"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/o/acme&user=$APIGEE_USER1&property=_permissions" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER1 can perform on the permissions of http://apigee.com/o/acme?"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/o/acme&user=$APIGEE_USER2" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER2 can perform on http://apigee.com/o/acme?"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/is-allowed?resource=http://apigee.com/o/acme&user=$APIGEE_USER1&action=delete" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "Have APIGEE_USER1 ask if APIGEE_USER1 can delete http://apigee.com/o/acme?"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl -i "http://localhost:8080/is-allowed?resource=http://apigee.com/o/acme&user=$APIGEE_USER1&action=delete" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
read -n 1 -p "Have APIGEE_USER2 ask if APIGEE_USER1 can delete http://apigee.com/o/acme?"
eval $command
echo ''
echo 'This failed because one user is not allowed to ask what a different user can do'

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/is-allowed?resource=http://apigee.com/o/acme&user=$APIGEE_USER2&action=delete" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
read -n 1 -p "ask if APIGEE_USER2 can delete http://apigee.com/o/acme?"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/resources-shared-with?$APIGEE_USER1" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "ask which resources have been shared with APIGEE_USER1"
eval $command
echo ''

##
echo -e "\n\n\x1B[7m chapter 2 \x1B[27m\n\n" #clear
read -n 1 -p "continue to chapter 2 - creating and using teams?"
team=$(cat << "EOF"
{
    "isA": "Team",
    "name": "Acme Org admins",
    "_permissions": {"_inheritsPermissionsOf": ["http://apigee.com/o/acme"],"test-data": true},
    "members": ["$APIGEE_USER1"],
    "test-data": true
    }
EOF)

####
echo "team=$team"
command='echo $team | envsubst | curl -i http://localhost:8080/teams -d @- -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "create this team?"
eval $command 
echo ''
echo "This failed because we did not give permission for anyone to inherit permissions from http://apigee.com/o/acme"

####
read -n 1 -p "continue?"
patch=$(cat << "EOF"
{
    "_permissionsHeirs": {
        "add":    ["$APIGEE_USER1", "$APIGEE_USER2", "$APIGEE_USER3"],
        "read":   ["$APIGEE_USER1", "$APIGEE_USER2", "$APIGEE_USER3"],
        "remove": ["$APIGEE_USER1"]
    }
}
EOF)
echo "patch=$patch"
command='echo $patch | envsubst | curl http://localhost:8080/permissions?http://apigee.com/o/acme -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $ACME_ORG_PERMISSIONS_ETAG" -D - -o ttx.txt'
echo $command
read -n 1 -p "patch permissions for http://apigee.com/o/acme to allow permissions inheritance?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_ORG_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
echo "team=$team"
command='echo $team | envsubst | curl http://localhost:8080/teams -d @- -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt'
echo $command
read -n 1 -p "retry creation of this team?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Location' ]; then
        export ACME_ORG_ADMINS="$value";
    fi
done < <(eval $command)
echo "Org admin team URL: $ACME_ORG_ADMINS"
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
patch=$(cat << "EOF"
{
    "_permissions": 
        {"read": ["$ACME_ORG_ADMINS"], 
        "update": ["$ACME_ORG_ADMINS"] 
        },     
    "_self": 
        {"update": ["$ACME_ORG_ADMINS"], 
        "read": ["$ACME_ORG_ADMINS"], 
        "delete": ["$ACME_ORG_ADMINS"] 
        }, 
    "_permissionsHeirs": {
        "add":    ["$ACME_ORG_ADMINS", "$APIGEE_USER2", "$APIGEE_USER3"],
        "read":   ["$ACME_ORG_ADMINS", "$APIGEE_USER2", "$APIGEE_USER3"],
        "remove": ["$ACME_ORG_ADMINS"]
    }
}
EOF)
echo "patch=$patch"
command='echo $patch | envsubst | curl http://localhost:8080/permissions?http://apigee.com/o/acme -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $ACME_ORG_PERMISSIONS_ETAG" -D - -o ttx.txt'
echo $command
read -n 1 -p "patch permissions for http://apigee.com/o/acme to reference org admin team rather than user?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_ORG_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=$ACME_ORG_ADMINS&user=$APIGEE_USER1" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER1 can perform on $ACME_ORG_ADMINS?"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=$ACME_ORG_ADMINS&user=$APIGEE_USER1&property=_permissions" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER1 can perform on the permissions of $ACME_ORG_ADMINS?"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=$ACME_ORG_ADMINS&user=$APIGEE_USER2" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER2 can perform on $ACME_ORG_ADMINS?"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/resources-shared-with?$APIGEE_USER1" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "ask which resources have been shared with APIGEE_USER1"
eval $command
echo ''

##
echo -e "\n\n\x1B[7m chapter 3 \x1B[27m\n\n" #clear
read -n 1 -p "continue to Chapter 3  - relationships?"
command='curl "http://localhost:8080/is-allowed?resource=http://apigee.com/o/acme&user=$APIGEE_USER1&action=create&property=environments" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "Ask if APIGEE_USER1 is allowed to create an environment in http://apigee.com/o/acme?"
eval $command
echo ''

####
read -n 1 -p "continue?"
patch=$(cat << "EOF"
{
    "environments": {
        "create": ["$ACME_ORG_ADMINS"],
        "read":   ["$ACME_ORG_ADMINS"]
    }
}
EOF)
echo "patch=$patch"
command='echo $patch | envsubst | curl http://localhost:8080/permissions?http://apigee.com/o/acme -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $ACME_ORG_PERMISSIONS_ETAG" -D - -o ttx.txt'
echo $command
read -n 1 -p "patch permissions for http://apigee.com/o/acme to allow creation of environments?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_ORG_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/o/acme&user=$APIGEE_USER1&property=environments" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER1 can perform on the environments property of http://apigee.com/o/acme?"
eval $command
echo ''

####
echo -e "\n\n\x1B[7m chapter 4 \x1B[27m\n\n" #clear
read -n 1 -p "continue to Chapter 4  - inheritance?"
permissions=$(cat << "EOF"
{
    "_subject": "http://apigee.com/env/acme-prod", 
    "_inheritsPermissionsOf": ["http://apigee.com/o/acme"], 
    "test-data": true
    }
EOF)
echo "permissions=$permissions"
command='echo $permissions | envsubst | curl http://localhost:8080/permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt' 
echo $command
read -n 1 -p "create the permissions for http://apigee.com/env/acme-prod?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_PROD_ENV_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
echo "permissions Etag: $ACME_PROD_ENV_PERMISSIONS_ETAG"
cat ttx.txt | python -mjson.tool

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-prod&user=$APIGEE_USER1" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER1 can perform on http://apigee.com/env/acme-prod"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-prod&user=$APIGEE_USER1&property=_permissions" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER1 can perform on the permissions of http://apigee.com/env/acme-prod"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-prod&user=$APIGEE_USER2" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER2 can perform on http://apigee.com/env/acme-prod"
eval $command
echo ''

####
read -n 1 -p "continue?"
permissions=$(cat << "EOF"
{
    "_subject": "http://apigee.com/env/acme-test", 
    "_inheritsPermissionsOf": ["http://apigee.com/o/acme"], 
    "test-data": true
    }
EOF)
echo "permissions=$permissions"
command='echo $permissions | envsubst | curl http://localhost:8080/permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt' 
echo $command
read -n 1 -p "create the permissions for http://apigee.com/env/acme-test?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_TEST_ENV_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
echo "permissions Etag: $ACME_TEST_ENV_PERMISSIONS_ETAG"
cat ttx.txt | python -mjson.tool

##
echo -e "\n\n\x1B[7m chapter 5 \x1B[27m\n\n" #clear
read -n 1 -p "continue to Chapter 5 - beyond RBAC: delegating administrative authority?"
####
patch=$(cat << "EOF"
{
    "_permissions": {
        "read": ["$APIGEE_USER2"], 
        "update": ["$APIGEE_USER2"] 
    }
}
EOF)
echo "patch=$patch"
command='echo $patch | envsubst | curl http://localhost:8080/permissions?http://apigee.com/env/acme-prod -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $ACME_PROD_ENV_PERMISSIONS_ETAG" -D - -o ttx.txt'
echo $command
read -n 1 -p "patch permissions for http://apigee.com/env/acme-prod to allow APIGEE_USER2 to access and administer it?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_PROD_ENV_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
patch=$(cat << "EOF"
{
    "_permissions": { 
        "read": ["$APIGEE_USER3"], 
        "update": ["$APIGEE_USER3"] 
    }
}
EOF)
echo "patch=$patch"
command='echo $patch | envsubst | curl http://localhost:8080/permissions?http://apigee.com/env/acme-test -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $ACME_TEST_ENV_PERMISSIONS_ETAG" -D - -o ttx.txt'
echo $command
read -n 1 -p "patch permissions for http://apigee.com/env/acme-test to allow APIGEE_USER3 to access and administer it?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_TEST_ENV_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
team=$(cat << "EOF"
{
    "isA": "Team",
    "name": "Acme Production Team",
    "_permissions": {
        "_inheritsPermissionsOf": ["http://apigee.com/o/acme"],
        "_self": {
            "update": [""], 
            "read": [""], 
            "delete": [""] 
        }, 
        "_permissions": { 
            "read": [""], 
            "update": [""] 
        },
        "test-data": true
    },
    "members": ["$APIGEE_USER2"],
    "test-data": true
}
EOF)
echo "team=$team"
command='echo $team | envsubst | curl http://localhost:8080/teams -d @- -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2" -D - -o ttx.txt'
echo $command
read -n 1 -p "have APIGEE_USER2 create the Acme Production Team?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Location' ]; then
        export ACME_PROD_TEAM="$value";
    fi
done < <(eval $command)
echo "production team URL: $ACME_PROD_TEAM"
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/permissions?$ACME_PROD_TEAM" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
read -n 1 -p "show the permissions for http://apigee.com/env/acme-prod?"
eval "$command | python -mjson.tool"
echo ''

####
read -n 1 -p "continue?"
team=$(cat << EOF
{
    "isA": "Team",
    "name": "Acme Test Team",
    "_permissions": {
        "_inheritsPermissionsOf": ["http://apigee.com/o/acme"],
        "_self": { 
            "update": [""], 
            "read": [""], 
            "delete": [""] 
        }, 
        "_permissions": { 
            "read": [""], 
            "update": [""] 
        },
        "test-data": true
    },
    "members": ["$APIGEE_USER3"],
    "test-data": true
}
EOF)
echo "team=$team"
command='echo $team | curl http://localhost:8080/teams -d @- -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN3" -D - -o ttx.txt'
echo $command
read -n 1 -p "have APIGEE_USER3 create the Acme Test Team?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Location' ]; then
        export ACME_TEST_TEAM="$value";
    fi;
    if [ "$key" == 'Etag' ]; then
        ACME_TEST_TEAM_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
echo "test team permissions URL: $ACME_TEST_TEAM"
echo "test team permissions Etag: $ACME_TEST_TEAM_PERMISSIONS_ETAG"
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
patch=$(cat << "EOF"
{
    "_self": { 
        "update": ["$ACME_PROD_TEAM"], 
        "read": ["$ACME_PROD_TEAM"], 
        "delete": ["$ACME_PROD_TEAM"] 
    }
}
EOF)
echo "patch=$patch"
command='echo $patch | envsubst | curl http://localhost:8080/permissions?http://apigee.com/env/acme-prod -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN2" -H "If-Match: $ACME_PROD_ENV_PERMISSIONS_ETAG" -D - -o ttx.txt'
echo $command
read -n 1 -p "have APIGEE_USER2 patch permissions for http://apigee.com/env/acme-prod to reference prod team?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_PROD_ENV_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
patch=$(cat << "EOF"
{
    "_self": 
        {"update": ["$ACME_TEST_TEAM"], 
        "read": ["$ACME_TEST_TEAM"], 
        "delete": ["$ACME_TEST_TEAM"] 
        }
}
EOF)
echo "patch=$patch"
command='echo $patch | envsubst | curl http://localhost:8080/permissions?http://apigee.com/env/acme-test -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN3" -H "If-Match: $ACME_TEST_ENV_PERMISSIONS_ETAG" -D - -o ttx.txt'
echo $command
read -n 1 -p "have APIGEE_USER3 patch permissions for http://apigee.com/env/acme-test to reference test team?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_TEST_ENV_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-prod&user=$APIGEE_USER2" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER2 can perform on http://apigee.com/env/acme-prod"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-test&user=$APIGEE_USER2" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER2 can perform on the permissions of http://apigee.com/env/acme-test"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-prod&user=$APIGEE_USER3" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN3"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER3 can perform on http://apigee.com/env/acme-prod"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-test&user=$APIGEE_USER3" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN3"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER3 can perform on the permissions of http://apigee.com/env/acme-test"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-prod&user=$APIGEE_USER1" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER1 can perform on http://apigee.com/env/acme-prod"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-test&user=$APIGEE_USER1" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER1 can perform on the permissions of http://apigee.com/env/acme-test"
eval $command
echo ''

##
echo -e "\n\n\x1B[7m chapter 6 \x1B[27m\n\n" #clear
read -n 1 -p 'continue to Chapter 6 - breaking free of the "logical hierarchy"?'
####
permissions=$(cat << "EOF"
{
    "_subject": "http://apigee.com/folder/acme-prod-assets", 
    "_inheritsPermissionsOf": ["http://apigee.com/o/acme"],
    "_self": { 
        "update": ["$ACME_PROD_TEAM"], 
        "read": ["$ACME_PROD_TEAM"], 
        "delete": ["$ACME_PROD_TEAM"] 
    }, 
    "_permissions": { 
        "read": ["$ACME_PROD_TEAM"], 
        "update": ["$ACME_PROD_TEAM"] 
    },     
    "deployments": {
        "create": ["$ACME_PROD_TEAM"], 
        "read": ["$ACME_PROD_TEAM"] 
    },
    "test-data": true
    }
EOF)
echo "permissions=$permissions"
command='echo $permissions | envsubst | curl http://localhost:8080/permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2" -D - -o ttx.txt' 
echo $command
read -n 1 -p "let APIGEE_USER2 create this folder permissions?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        acme_prod_assets_permissons_etag="$value";
    fi
done < <(eval $command)
echo "acme-prod-assets folder permissions Etag: $acme_prod_assets_permissons_etag"
cat ttx.txt | python -mjson.tool

####
read -n 1 -p "continue?"
permissions=$(cat << "EOF"
{
    "_subject": "http://apigee.com/folder/acme-test-assets", 
    "_inheritsPermissionsOf": ["http://apigee.com/o/acme"],
    "_self": { 
        "update": ["$ACME_TEST_TEAM"], 
        "read": ["$ACME_TEST_TEAM"], 
        "delete": ["$ACME_TEST_TEAM"] 
    }, 
    "_permissions": {
        "read": ["$ACME_TEST_TEAM"], 
        "update": ["$ACME_TEST_TEAM"] 
    },     
    "deployments": {
        "create": ["$ACME_PROD_TEAM"], 
        "read": ["$ACME_PROD_TEAM"] 
    },     
    "test-data": true
    }
EOF)
echo "permissions=$permissions"
command='echo $permissions | envsubst | curl http://localhost:8080/permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt' 
echo $command
read -n 1 -p "let APIGEE_USER3 create this folder permissions?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_TEST_ASSETS_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
echo "acme-test-assets folder permissions Etag: $ACME_TEST_ASSETS_PERMISSIONS_ETAG"
cat ttx.txt | python -mjson.tool

####
read -n 1 -p "continue?"
patch=$(cat << EOF
{
    "_inheritsPermissionsOf": ["http://apigee.com/folder/acme-prod-assets"], 
    "_self": null, 
    "_permissions": null
}
EOF)
echo "patch=$patch"
command='echo $patch | curl http://localhost:8080/permissions?http://apigee.com/env/acme-prod -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN2" -H "If-Match: $ACME_PROD_ENV_PERMISSIONS_ETAG" -D - -o ttx.txt'
echo $command
read -n 1 -p "have APIGEE_USER2 patch permissions for http://apigee.com/env/acme-prod to inherit from folder?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_PROD_ENV_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
patch=$(cat << EOF
{
    "_inheritsPermissionsOf": ["http://apigee.com/folder/acme-test-assets"], 
    "_self": null, 
    "_permissions": null
}
EOF)
echo "patch=$patch"
command='echo $patch | curl http://localhost:8080/permissions?http://apigee.com/env/acme-test -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN3" -H "If-Match: $ACME_TEST_ENV_PERMISSIONS_ETAG" -D - -o ttx.txt'
echo $command
read -n 1 -p "have APIGEE_USER3 patch permissions for http://apigee.com/env/acme-test to inherit from folder?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_TEST_ENV_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-prod&user=$APIGEE_USER2" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER2 can perform on http://apigee.com/env/acme-prod"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-test&user=$APIGEE_USER2" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER2 can perform on the permissions of http://apigee.com/env/acme-test"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-prod&user=$APIGEE_USER3" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN3"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER3 can perform on http://apigee.com/env/acme-prod"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-test&user=$APIGEE_USER3" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN3"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER3 can perform on the permissions of http://apigee.com/env/acme-test"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-prod&user=$APIGEE_USER1" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER1 can perform on http://apigee.com/env/acme-prod"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-test&user=$APIGEE_USER1" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER1 can perform on the permissions of http://apigee.com/env/acme-test"
eval $command
echo ''

##
echo -e "\n\n\x1B[7m chapter 7 \x1B[27m\n\n" #clear
read -n 1 -p 'continue to Chapter 7 - constraining access to subjects of a particular issuer'
####

patch=$(cat << "EOF"
   [
       {"op": "add", "path": "/members/-", "value": "$APIGEE_USER4" }
   ]
EOF)
echo "patch=$patch"
command='echo $patch | envsubst | curl localhost:8080$ACME_TEST_TEAM -X PATCH -d @-  -H "Content-Type: application/json-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN3" -H "If-Match: $ACME_TEST_TEAM_PERMISSIONS_ETAG" -D - -o ttx.txt'
echo $command
     
read -n 1 -p "have APIGEE_USER3 add APIGEE_USER4 to test_assets folder?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_TEST_TEAM_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-test&user=$APIGEE_USER4" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN4"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER4 can perform on http://apigee.com/env/acme-test"
eval $command
echo ''

####
read -n 1 -p "continue?"
patch=$(cat << EOF
{
    "_constraints": {
        "validIssuers": ["https://login.e2e.apigee.net"]
    }
}
EOF)
echo "patch=$patch"
command='echo $patch | curl http://localhost:8080/permissions?http://apigee.com/o/acme -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $ACME_ORG_PERMISSIONS_ETAG" -D - -o ttx.txt'
echo $command
read -n 1 -p "patch permissions for http://apigee.com/o/acme to allow permissions inheritance?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_ORG_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-test&user=$APIGEE_USER4" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN4"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER4 can perform on http://apigee.com/env/acme-test"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-test&user=$APIGEE_USER3" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN3"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER3 can perform on http://apigee.com/env/acme-test"
eval $command
echo ''

##
echo -e "\n\n\x1B[7m chapter 8 \x1B[27m\n\n" #clear
read -n 1 -p 'continue to Chapter 8 - restricting the ability to widen permissions?'
####
permissions=$(cat << "EOF"
{
    "_subject": "http://apigee.com/folder/confidential", 
    "_self": { 
        "update": ["$APIGEE_USER1"], 
        "read": ["$APIGEE_USER1"], 
        "delete": ["$APIGEE_USER1"] 
    }, 
    "_permissions": { 
        "read": ["$APIGEE_USER1"], 
        "update": ["$APIGEE_USER1"] 
    },     
    "_permissionsHeirs": {
        "add":    ["$APIGEE_USER1", "$APIGEE_USER2", "$APIGEE_USER3"],
        "read":   ["$APIGEE_USER1", "$APIGEE_USER2", "$APIGEE_USER3"],
        "remove": ["$APIGEE_USER1"]
    },
    "_constraints": {
        "wideningForbidden": true
    },
    "test-data": true
}
EOF)
echo "permissions=$permissions"
command='echo $permissions | envsubst | curl http://localhost:8080/permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt' 
echo $command
read -n 1 -p "let APIGEE_USER1 create this folder permissions?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        acme_prod_assets_permissons_etag="$value";
    fi
done < <(eval $command)
echo "acme-prod-assets folder permissions Etag: $acme_prod_assets_permissons_etag"
cat ttx.txt | python -mjson.tool

####
read -n 1 -p "continue?"
patch=$(cat << EOF
   [
       {"op": "add", "path": "/_inheritsPermissionsOf/-", "value": "http://apigee.com/folder/confidential" }
   ]
EOF)
echo "patch=$patch"
command='echo $patch | curl http://localhost:8080/permissions?http://apigee.com/folder/acme-test-assets -d @- -X PATCH -H "Content-Type: application/json-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN3" -H "If-Match: $ACME_TEST_ASSETS_PERMISSIONS_ETAG" -D - -o ttx.txt'
echo $command
read -n 1 -p "have APIGEE_USER3 patch permissions for http://apigee.com/folder/acme-test-assets to inherit from http://apigee.com/folder/confidential?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_TEST_ASSETS_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/env/acme-test&user=$APIGEE_USER3" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN3"'
echo $command
read -n 1 -p "show actions APIGEE_USER3 can perform on http://apigee.com/env/acme-test"
eval $command
echo ''

##
echo -e "\n\n\x1B[7m Last chapter - completing the circle \x1B[27m\n\n" #clear
read -n 1 -p 'continue to Last Chapter - why was I able to create permissions and teams at the beginning of this tutorial?'

####
command='curl "http://localhost:8080/permissions?/" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN3"'
echo $command
read -n 1 -p 'show permissions for "localhost:8080/"'
eval "$command | python -mjson.tool"
echo ''
