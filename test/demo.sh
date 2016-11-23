shopt -s extglob # Required to trim whitespace; see below
read -n 1 -p "delete prior test data?"
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
read -n 1 -p "create the following permissions?: $permissions"
command='echo $permissions | curl -D - -o ttx.txt http://localhost:8080/permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"' 
echo $command
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        org_permissons_etag="$value";
    fi
done < <(eval $command)
echo "permissions Etag: $org_permissons_etag"
cat ttx.txt | python -mjson.tool

####
read -n 1 -p "continue?"
read -n 1 -p "query the actions that APIGEE_USER1 can perform on http://apigee.com/o/acme?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/o/acme&user=$APIGEE_USER1" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
eval $command
echo ''

####
read -n 1 -p "continue?"
read -n 1 -p "query the actions that APIGEE_USER1 can perform on the permissions of http://apigee.com/o/acme?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/o/acme&user=$APIGEE_USER1&property=_permissions" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
eval $command
echo ''

####
read -n 1 -p "continue?"
read -n 1 -p "query the actions that APIGEE_USER2 can perform on http://apigee.com/o/acme?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/o/acme&user=$APIGEE_USER2" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
eval $command
echo ''

####
read -n 1 -p "continue?"
read -n 1 -p "Have APIGEE_USER1 ask if APIGEE_USER1 can delete http://apigee.com/o/acme?"
command='curl "http://localhost:8080/is-allowed?resource=http://apigee.com/o/acme&user=$APIGEE_USER1&action=delete" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
eval $command
echo ''

####
read -n 1 -p "continue?"
read -n 1 -p "Have APIGEE_USER2 ask if APIGEE_USER1 can delete http://apigee.com/o/acme?"
command='curl -i "http://localhost:8080/is-allowed?resource=http://apigee.com/o/acme&user=$APIGEE_USER1&action=delete" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
eval $command
echo ''
echo 'This failed because one user is not allowed to ask what a different user can do'

####
read -n 1 -p "continue?"
read -n 1 -p "ask if APIGEE_USER2 can delete http://apigee.com/o/acme?"
command='curl "http://localhost:8080/is-allowed?resource=http://apigee.com/o/acme&user=$APIGEE_USER2&action=delete" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
eval $command
echo ''

read -n 1 -p "ask which resources have been shared with APIGEE_USER1"
command='curl "http://localhost:8080/resources-shared-with?$APIGEE_USER1" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
eval $command
echo ''

##
read -n 1 -p "continue to chapter 2 - creating and using teams?"
team=$(cat << EOF
{
    "isA": "Team",
    "name": "Acme Org admins",
    "permissions": {"_inheritsPermissionsOf": ["http://apigee.com/o/acme"],"test-data": true},
    "members": ["$APIGEE_USER1"],
    "test-data": true
    }
EOF)

####
read -n 1 -p "create the following team?: $team"
command='echo $team | curl http://localhost:8080/teams -d @- -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
eval $command 
echo ''
echo "This failed because we did not give permission for anyone to inherit permissions from http://apigee.com/o/acme"

####
read -n 1 -p "continue?"
patch=$(cat << EOF
{
    "_permissionsHeirs": {
        "add": ["$APIGEE_USER1"],
        "read": ["$APIGEE_USER1"],
        "remove": ["$APIGEE_USER1"]
    }
}
EOF)
read -n 1 -p "patch permissions for http://apigee.com/o/acme to allow permissions inheritance? ${patch}"
command='echo $patch | curl -D - -o ttx.txt http://localhost:8080/permissions?http://apigee.com/o/acme -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $org_permissons_etag"'
echo $command
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        org_permissons_etag="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
read -n 1 -p "retry creation of the following team?: $team"
command='echo $team | curl -D - -o ttx.txt http://localhost:8080/teams -d @- -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Location' ]; then
        acme_org_admins_team_url="$value";
    fi
done < <(eval $command)
echo "team URL: $acme_org_admins_team_url"
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
        "add": ["$acme_org_admins_team_url"],
        "read": ["$acme_org_admins_team_url"],
        "remove": ["$acme_org_admins_team_url"]
    }
}
EOF)
read -n 1 -p "patch permissions for http://apigee.com/o/acme to reference org admin team rather than user? ${patch}"
command='echo $patch | curl -D - -o ttx.txt http://localhost:8080/permissions?http://apigee.com/o/acme -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $org_permissons_etag"'
echo $command
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        org_permissons_etag="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
read -n 1 -p "query the actions that APIGEE_USER1 can perform on $acme_org_admins_team_url?"
command='curl "http://localhost:8080/allowed-actions?resource=$acme_org_admins_team_url&user=$APIGEE_USER1" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
eval $command
echo ''

read -n 1 -p "continue?"
read -n 1 -p "query the actions that APIGEE_USER1 can perform on the permissions of $acme_org_admins_team_url?"
command='curl "http://localhost:8080/allowed-actions?resource=$acme_org_admins_team_url&user=$APIGEE_USER1&property=_permissions" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
eval $command
echo ''

####
read -n 1 -p "continue?"
read -n 1 -p "query the actions that APIGEE_USER2 can perform on $acme_org_admins_team_url?"
command='curl "http://localhost:8080/allowed-actions?resource=$acme_org_admins_team_url&user=$APIGEE_USER2" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN2"'
echo $command
eval $command
echo ''

##
read -n 1 -p "continue to Chapter 3  - relationships?"
read -n 1 -p "Ask if APIGEE_USER1 is allowed to create an environment in http://apigee.com/o/acme?"
command='curl "http://localhost:8080/is-allowed?resource=http://apigee.com/o/acme&user=$APIGEE_USER1&action=create&property=environments" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
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
read -n 1 -p "patch permissions for http://apigee.com/o/acme to allow creation of environments? ${patch}"
command='echo $patch | curl -D - -o ttx.txt http://localhost:8080/permissions?http://apigee.com/o/acme -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $org_permissons_etag"'
echo $command
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        org_permissons_etag="$value";
    fi
done < <(eval $command)
cat ttx.txt | python -mjson.tool
echo ''

####
read -n 1 -p "continue?"
read -n 1 -p "query the actions that APIGEE_USER1 can perform on the environments property of http://apigee.com/o/acme?"
command='curl "http://localhost:8080/allowed-actions?resource=http://apigee.com/o/acme&user=$APIGEE_USER1&property=environments" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"'
echo $command
eval $command
echo ''

exit
####
read -n 1 -p "continue?"
permissions=$(cat << EOF
{
    "_subject": "http://apigee.com/env/123456789", 
    "_inheritsPermissionsOf": [http://apigee.com/o/acme], 
    "test-data": true
    }
EOF)
read -n 1 -p "create the following permissions?: $permissions"
command='echo $permissions | curl -D - -o ttx.txt http://localhost:8080/permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1"' 
echo $command
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        env_permissons_etag="$value";
    fi
done < <(eval $command)
echo "permissions Etag: $env_permissons_etag"
cat ttx.txt | python -mjson.tool
read -n 1 -p "continue?"

