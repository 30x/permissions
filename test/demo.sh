shopt -s extglob # Required to trim whitespace; see below
#read -n 1 -p "delete prior test data?"
./delete-test-data-local.sh

#read -n 1 -p "continue to renew tokens?"
#source renew-tokens.sh

####
read -n 1 -p "continue?"
permissions=$(cat << EOF
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
echo "APIGEE_USER1 = ${APIGEE_USER1}"
echo "permissions=$permissions"
command='echo $permissions | curl http://localhost:8080/permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt' 
echo $command
read -n 1 -p "create these permissions?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        acme_org_permissons_etag="$value";
    fi
done < <(eval $command)
echo "permissions Etag: $acme_org_permissons_etag"
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
read -n 1 -p "continue to chapter 2 - creating and using teams?"
team=$(cat << EOF
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
command='echo $team | curl -i http://localhost:8080/teams -d @- -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "create this team?"
eval $command 
echo ''
echo "This failed because we did not give permission for anyone to inherit permissions from http://apigee.com/o/acme"

####
read -n 1 -p "continue?"
patch=$(cat << EOF
{
    "_permissionsHeirs": {
        "add": ["$APIGEE_USER1", "$APIGEE_USER2", "$APIGEE_USER3"],
        "read": ["$APIGEE_USER1"],
        "remove": ["$APIGEE_USER1"]
    }
}
EOF)
echo "patch=$patch"
command='echo $patch | curl http://localhost:8080/permissions?http://apigee.com/o/acme -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $acme_org_permissons_etag" -D - -o ttx.txt'
echo $command
read -n 1 -p "patch permissions for http://apigee.com/o/acme to allow permissions inheritance?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        acme_org_permissons_etag="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
echo "team=$team"
command='echo $team | curl http://localhost:8080/teams -d @- -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt'
echo $command
read -n 1 -p "retry creation of this team?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Location' ]; then
        acme_org_admins_team_url="$value";
    fi
done < <(eval $command)
echo "Org admin team URL: $acme_org_admins_team_url"
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
patch=$(cat << EOF
{
    "_permissions": 
        {"read": ["$acme_org_admins_team_url"], 
        "update": ["$acme_org_admins_team_url"] 
        },     
    "_self": 
        {"update": ["$acme_org_admins_team_url"], 
        "read": ["$acme_org_admins_team_url"], 
        "delete": ["$acme_org_admins_team_url"] 
        }, 
    "_permissionsHeirs": {
        "add": ["$acme_org_admins_team_url", "$APIGEE_USER2", "$APIGEE_USER3"],
        "read": ["$acme_org_admins_team_url"],
        "remove": ["$acme_org_admins_team_url"]
    }
}
EOF)
echo "patch=$patch"
command='echo $patch | curl http://localhost:8080/permissions?http://apigee.com/o/acme -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $acme_org_permissons_etag" -D - -o ttx.txt'
echo $command
read -n 1 -p "patch permissions for http://apigee.com/o/acme to reference org admin team rather than user?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        acme_org_permissons_etag="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=$acme_org_admins_team_url&user=$APIGEE_USER1" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER1 can perform on $acme_org_admins_team_url?"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=$acme_org_admins_team_url&user=$APIGEE_USER1&property=_permissions" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER1 can perform on the permissions of $acme_org_admins_team_url?"
eval $command
echo ''

####
read -n 1 -p "continue?"
command='curl "http://localhost:8080/allowed-actions?resource=$acme_org_admins_team_url&user=$APIGEE_USER2" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
read -n 1 -p "query the actions that APIGEE_USER2 can perform on $acme_org_admins_team_url?"
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
read -n 1 -p "continue to Chapter 3  - relationships?"
command='curl "http://localhost:8080/is-allowed?resource=http://apigee.com/o/acme&user=$APIGEE_USER1&action=create&property=environments" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
read -n 1 -p "Ask if APIGEE_USER1 is allowed to create an environment in http://apigee.com/o/acme?"
eval $command
echo ''

####
read -n 1 -p "continue?"
patch=$(cat << EOF
{
    "environments": {
        "create": ["$acme_org_admins_team_url"],
        "read": ["$acme_org_admins_team_url"]
    }
}
EOF)
echo "patch=$patch"
command='echo $patch | curl http://localhost:8080/permissions?http://apigee.com/o/acme -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $acme_org_permissons_etag" -D - -o ttx.txt'
echo $command
read -n 1 -p "patch permissions for http://apigee.com/o/acme to allow creation of environments?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        acme_org_permissons_etag="$value";
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
read -n 1 -p "continue?"
permissions=$(cat << EOF
{
    "_subject": "http://apigee.com/env/acme-prod", 
    "_inheritsPermissionsOf": ["http://apigee.com/o/acme"], 
    "test-data": true
    }
EOF)
echo "permissions=$permissions"
command='echo $permissions | curl http://localhost:8080/permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt' 
echo $command
read -n 1 -p "create the permissions for http://apigee.com/env/acme-prod?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        acme_prod_env_permissions_etag="$value";
    fi
done < <(eval $command)
echo "permissions Etag: $acme_prod_env_permissions_etag"
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
permissions=$(cat << EOF
{
    "_subject": "http://apigee.com/env/acme-test", 
    "_inheritsPermissionsOf": ["http://apigee.com/o/acme"], 
    "test-data": true
    }
EOF)
echo "permissions=$permissions"
command='echo $permissions | curl http://localhost:8080/permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt' 
echo $command
read -n 1 -p "create the permissions for http://apigee.com/env/acme-test?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        acme_test_env_permissions_etag="$value";
    fi
done < <(eval $command)
echo "permissions Etag: $acme_test_env_permissions_etag"
cat ttx.txt | python -mjson.tool

##
read -n 1 -p "continue to Chapter 4 - beyond the Edge model?"

####
patch=$(cat << EOF
{
    "_permissions": {
        "read": ["$APIGEE_USER2"], 
        "update": ["$APIGEE_USER2"] 
    }
}
EOF)
echo "patch=$patch"
command='echo $patch | curl http://localhost:8080/permissions?http://apigee.com/env/acme-prod -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $acme_prod_env_permissions_etag" -D - -o ttx.txt'
echo $command
read -n 1 -p "patch permissions for http://apigee.com/env/acme-prod to allow APIGEE_USER2 to access and administer it?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        acme_prod_env_permissions_etag="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
patch=$(cat << EOF
{
    "_permissions": { 
        "read": ["$APIGEE_USER3"], 
        "update": ["$APIGEE_USER3"] 
    }
}
EOF)
echo "patch=$patch"
command='echo $patch | curl http://localhost:8080/permissions?http://apigee.com/env/acme-test -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $acme_test_env_permissions_etag" -D - -o ttx.txt'
echo $command
read -n 1 -p "patch permissions for http://apigee.com/env/acme-test to allow APIGEE_USER3 to access and administer it?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        acme_test_env_permissions_etag="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
team=$(cat << EOF
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
command='echo $team | curl http://localhost:8080/teams -d @- -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2" -D - -o ttx.txt'
echo $command
read -n 1 -p "have APIGEE_USER2 create the Acme Production Team?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Location' ]; then
        acme_production_team_url="$value";
    fi
done < <(eval $command)
echo "production team URL: $acme_production_team_url"
cat ttx.txt | python -mjson.tool
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
        acme_test_team_url="$value";
    fi
done < <(eval $command)
echo "test team URL: $acme_test_team_url"
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
patch=$(cat << EOF
{
    "_self": { 
        "update": ["$acme_production_team_url"], 
        "read": ["$acme_production_team_url"], 
        "delete": ["$acme_production_team_url"] 
    }
}
EOF)
echo "patch=$patch"
command='echo $patch | curl http://localhost:8080/permissions?http://apigee.com/env/acme-prod -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN2" -H "If-Match: $acme_prod_env_permissions_etag" -D - -o ttx.txt'
echo $command
read -n 1 -p "have APIGEE_USER2 patch permissions for http://apigee.com/env/acme-prod to reference prod team?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        acme_prod_env_permissions_etag="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
patch=$(cat << EOF
{
    "_self": 
        {"update": ["$acme_test_team_url"], 
        "read": ["$acme_test_team_url"], 
        "delete": ["$acme_test_team_url"] 
        }
}
EOF)
echo "patch=$patch"
command='echo $patch | curl http://localhost:8080/permissions?http://apigee.com/env/acme-test -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN3" -H "If-Match: $acme_test_env_permissions_etag" -D - -o ttx.txt'
echo $command
read -n 1 -p "have APIGEE_USER3 patch permissions for http://apigee.com/env/acme-test to reference test team?"
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        acme_test_env_permissions_etag="$value";
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
read -n 1 -p "continue to Chapter 5 - beyond the logical hierarchy?"

