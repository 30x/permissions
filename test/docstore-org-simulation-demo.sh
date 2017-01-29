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
        "delete": ["$APIGEE_USER1"], 
        "admin": ["$APIGEE_USER1"], 
        "govern": ["$APIGEE_USER1"] 
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
echo "Created Acme Org Admins Team: $ACME_ORG_ADMINS"
echo $team | python -mjson.tool
read -n 1 -p "continue?"

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
echo "Created Acme Business Users Team: $ACME_BUSINESS_USERS"
echo $team | python -mjson.tool
read -n 1 -p "continue?"

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
echo "Created Acme Regular Users Team: $ACME_REGULAR_USERS"
echo $team | python -mjson.tool
read -n 1 -p "continue?"

####
patch=$(cat << "EOF"
{
    "_self": {
        "update": ["$ACME_ORG_ADMINS"], 
        "read":    ["$ACME_ORG_ADMINS", "$ACME_BUSINESS_USERS", "$ACME_REGULAR_USERS"], 
        "delete":  ["$ACME_ORG_ADMINS"],
        "admin": ["$ACME_ORG_ADMINS"], 
        "govern": ["$ACME_ORG_ADMINS"] 
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
echo 'Created Acme Org permissions:'
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

echo -e "\n\n\x1B[7m Step 3 - USER3 (regular user) creates [permissions for] a new spec in the org's root folder \x1B[27m\n\n" #clear
read -n 1 -p "continue?"

permissions=$(cat << "EOF"
{
    "_subject": "http://apigee.com/spec/12345", 
    "_inheritsPermissionsOf": ["http://apigee.com/folder/12345"],
    "test-data": true
    }
EOF)
command='echo $permissions | envsubst | curl http://localhost:8080/permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN3" -D - -o ttx.txt -sS' 
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_ORG_FOLDER_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)

echo '/spec/12345 permissions'
cat ttx.txt | python -mjson.tool
echo ''

echo -e "\n\n\x1B[7m Step 4 - lets see what USER3 can do with these permissions \x1B[27m\n\n" #clear
read -n 1 -p "continue?"

command='curl "http://localhost:8080/is-allowed?resource=http://apigee.com/spec/12345&user=$APIGEE_USER3&action=read" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN3" -Ss'
echo $command
echo -n "Have APIGEE_USER1 ask if APIGEE_USER1 can read http://apigee.com/spec/12345: "
echo -e "\x1B[7m$(eval $command)\x1B[27m" 
echo ''
command='curl "http://localhost:8080/is-allowed?resource=http://apigee.com/spec/12345&user=$APIGEE_USER3&action=update" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN3" -Ss'
echo $command
echo -n "Have APIGEE_USER1 ask if APIGEE_USER1 can update http://apigee.com/spec/12345: "
echo -e "\x1B[7m$(eval $command)\x1B[27m" 
echo ''
echo 'So USER3 cannot update the spec she just made'
read -n 1 -p "continue?"
echo 'We could "fix" this by changing the initial permissions of the spec to look like this: '
permissions=$(cat << "EOF"
{
    "_subject": "http://apigee.com/spec/12345", 
    "_inheritsPermissionsOf": ["http://apigee.com/folder/12345"],
    "_self": {
        "update": ["$APIGEE_USER3"],
        "delete": ["$APIGEE_USER3"]
    },
    "test-data": true
    }
EOF)
echo $permissions | python -mjson.tool
echo 'This would create a lot of specs whose permissions reference individuals, which is not desirable in an org setting.'

echo -e "\n\n\x1B[7m Step 5 - instead lets change the root folder permissions to get a better behavior \x1B[27m\n\n" #clear
read -n 1 -p "continue?"

##
team=$(cat << "EOF"
{
    "isA": "Team",
    "name": "Acme Spec Authors",
    "_permissions": {"_inheritsPermissionsOf": ["http://apigee.com/o/acme"],"test-data": true},
    "members": ["$APIGEE_USER3"],
    "test-data": true
    }
EOF)

command='echo $team | envsubst | curl http://localhost:8080/teams -d @- -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt -sS'
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Location' ]; then
        export ACME_SPEC_AUTHORS="$value";
    fi
done < <(eval $command)
echo 'Created Acme Spec Authors team:'
echo $team | python -mjson.tool
echo ''
read -n 1 -p "continue?"

####
patch=$(cat << "EOF"
{
    "_inheritsPermissionsOf": ["http://apigee.com/o/acme"],
    "_self": {
        "update":  ["$ACME_SPEC_AUTHORS"], 
        "read":    ["$ACME_SPEC_AUTHORS"], 
        "delete":  ["$ACME_SPEC_AUTHORS"] 
        }, 
    "_permissionsHeirs": {
        "add":    ["$ACME_SPEC_AUTHORS"],
        "read":   ["$ACME_SPEC_AUTHORS"],
        "remove": ["$ACME_SPEC_AUTHORS"]
        }
}
EOF)
command='echo $patch | envsubst | curl http://localhost:8080/permissions?http://apigee.com/folder/12345 -d @- -X PATCH -H "Content-Type: application/merge-patch+json" -H "Authorization: Bearer $APIGEE_TOKEN1" -H "If-Match: $ACME_ORG_FOLDER_PERMISSIONS_ETAG" -D - -o ttx.txt -sS'
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        ACME_ORG_FOLDER_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)
echo 'Patch Acme root folder permissions'
echo $patch | python -mjson.tool
echo ''

echo -e "\n\n\x1B[7m Step 6 - lets see what USER3 can do with these permissions \x1B[27m\n\n" #clear
read -n 1 -p "continue?"

command='curl "http://localhost:8080/is-allowed?resource=http://apigee.com/spec/12345&user=$APIGEE_USER3&action=read" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN3" -Ss'
echo $command
echo -n "Have APIGEE_USER1 ask if APIGEE_USER1 can read http://apigee.com/spec/12345: "
echo -e "\x1B[7m$(eval $command)\x1B[27m" 
echo ''
command='curl "http://localhost:8080/is-allowed?resource=http://apigee.com/spec/12345&user=$APIGEE_USER3&action=update" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN3" -Ss'
echo $command
echo -n "Have APIGEE_USER1 ask if APIGEE_USER1 can update http://apigee.com/spec/12345: "
echo -e "\x1B[7m$(eval $command)\x1B[27m" 
echo ''
echo 'So now USER3 can update the spec she just made'
