shopt -s extglob # Required to trim whitespace; see below
#read -n 1 -p "delete prior test data?"
./delete-test-data-local.sh &> /dev/null

#read -n 1 -p "continue to renew tokens?"
#source renew-tokens.sh

##
echo -e "\n\n\x1B[7m Step 1 - set up permissions for org \x1B[27m\n\n" #clear
read -n 1 -p "continue?"
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
    "_permissionsHeirs": {
        "add":    ["$APIGEE_USER1", "$APIGEE_USER2", "$APIGEE_USER3"],
        "read":   ["$APIGEE_USER1", "$APIGEE_USER2", "$APIGEE_USER3"],
        "remove": ["$APIGEE_USER1"]
        },
    "test-data": true
    }
EOF)
command='echo $permissions | envsubst | curl http://localhost:8080/permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt -sS' 
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_ORG_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)

##
team=$(cat << "EOF"
{
    "isA": "Team",
    "name": "Acme Org admins",
    "_permissions": {"_inheritsPermissionsOf": ["http://apigee.com/o/acme"],"test-data": true},
    "members": ["$APIGEE_USER1"],
    "test-data": true
    }
EOF)

command='echo $team | envsubst | curl http://localhost:8080/teams -d @- -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt -sS'
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Location' ]; then
        export ACME_ORG_ADMINS="$value";
    fi
done < <(eval $command)

##
team=$(cat << "EOF"
{
    "isA": "Team",
    "name": "Acme Business Users",
    "_permissions": {"_inheritsPermissionsOf": ["http://apigee.com/o/acme"],"test-data": true},
    "members": ["$APIGEE_USER2"],
    "test-data": true
    }
EOF)

command='echo $team | envsubst | curl http://localhost:8080/teams -d @- -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt -Ss'
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Location' ]; then
        export ACME_BUSINESS_USERS="$value";
    fi
done < <(eval $command)

##
team=$(cat << "EOF"
{
    "isA": "Team",
    "name": "Acme Regular Users",
    "_permissions": {"_inheritsPermissionsOf": ["http://apigee.com/o/acme"],"test-data": true},
    "members": ["$APIGEE_USER3"],
    "test-data": true
    }
EOF)

command='echo $team | envsubst | curl http://localhost:8080/teams -d @- -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt -sS'
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Location' ]; then
        export ACME_REGULAR_USERS="$value";
    fi
done < <(eval $command)

####
patch=$(cat << "EOF"
{
    "_permissions": {
        "read": ["$ACME_ORG_ADMINS"], 
        "update": ["$ACME_ORG_ADMINS"] 
        },     
    "_self": {
        "update": ["$ACME_ORG_ADMINS"], 
        "read":    ["$ACME_ORG_ADMINS", "$ACME_BUSINESS_USERS", "$ACME_REGULAR_USERS"], 
        "delete":  ["$ACME_ORG_ADMINS"] 
        }, 
    "_permissionsHeirs": {
        "add":    ["$ACME_ORG_ADMINS", "$ACME_BUSINESS_USERS", "$ACME_REGULAR_USERS"],
        "read":   ["$ACME_ORG_ADMINS", "$ACME_BUSINESS_USERS", "$ACME_REGULAR_USERS"],
        "remove": ["$ACME_ORG_ADMINS"]
        }
}
EOF)
command='echo $patch | envsubst | curl http://localhost:8080/permissions?http://apigee.com/o/acme -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $ACME_ORG_PERMISSIONS_ETAG" -D - -o ttx.txt -sS'
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_ORG_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
echo 'Acme Org permissions'
cat ttx.txt | python -mjson.tool
echo ''

echo -e "\n\n\x1B[7m Step 2 - set up permissions for Org's root folder' \x1B[27m\n\n" #clear
read -n 1 -p "continue?"
permissions=$(cat << "EOF"
{
    "_subject": "http://apigee.com/folder/12345", 
    "_inheritsPermissionsOf": ["http://apigee.com/o/acme"],
    "test-data": true
    }
EOF)
command='echo $permissions | envsubst | curl http://localhost:8080/permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt -sS' 
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_ORG_FOLDER_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)

echo 'Acme Org folder permissions'
cat ttx.txt | python -mjson.tool
echo ''
