shopt -s extglob # Required to trim whitespace; see below
#read -n 1 -p "delete prior test data?"
./delete-test-data-local.sh &> /dev/null

#read -n 1 -p "continue to renew tokens?"
#source renew-tokens.sh

echo -e "\n\n\x1B[7m Step 1 - set up permissions for personal root folder' \x1B[27m\n\n" #clear
read -n 1 -p "continue?"
permissions=$(cat << "EOF"
{
    "_subject": "http://apigee.com/folder/98765", 
    "_self": 
        {"update": ["$APIGEE_USER1"], 
        "read":    ["$APIGEE_USER1"], 
        "delete":  ["$APIGEE_USER1"],
        "admin":   ["$APIGEE_USER1"], 
        "govern":  ["$APIGEE_USER1"] 
        },     
    "_permissionsHeirs": {
        "add":     ["$APIGEE_USER1"],
        "read":    ["$APIGEE_USER1"],
        "remove":  ["$APIGEE_USER1"]
    },
    "test-data": true
    }
EOF)
command='echo $permissions | envsubst | curl http://localhost:8080/az-permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt -sS' 
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        PERSONAL_FOLDER_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)

echo 'Personal folder permissions'
cat ttx.txt | python -mjson.tool
echo ''

echo -e "\n\n\x1B[7m Step 2 - USER1 creates [permissions for] a new spec in her personal root folder \x1B[27m\n\n" #clear
read -n 1 -p "continue?"

permissions=$(cat << "EOF"
{
    "_subject": "http://apigee.com/spec/12345", 
    "_inheritsPermissionsOf": ["http://apigee.com/folder/98765"],
    "test-data": true
    }
EOF)
command='echo $permissions | envsubst | curl http://localhost:8080/az-permissions -d @-  -H "Content-Type: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -D - -o ttx.txt -sS' 
while IFS=':' read key value; do
    value=${value##+([[:space:]])}; value=${value%%+([[:space:]])}
    if [ "$key" == 'Etag' ]; then
        PERSONAL_FOLDER_PERMISSIONS_ETAG="$value";
    fi
done < <(eval $command)

echo '/spec/12345 permissions'
cat ttx.txt | python -mjson.tool
echo ''

echo -e "\n\n\x1B[7m Step 4 - lets see what USER1 can do with these permissions \x1B[27m\n\n" #clear
read -n 1 -p "continue?"

command='curl "http://localhost:8080/az-is-allowed?resource=http://apigee.com/spec/12345&user=$APIGEE_USER1&action=read" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -Ss'
echo $command
echo -n "Have APIGEE_USER1 ask if APIGEE_USER1 can read http://apigee.com/spec/12345: "
echo -e "\x1B[7m$(eval $command)\x1B[27m" 
eval $command
echo ''
command='curl "http://localhost:8080/az-is-allowed?resource=http://apigee.com/spec/12345&user=$APIGEE_USER1&action=update" -H "Accept: application/json" -H "Authorization: Bearer $APIGEE_TOKEN1" -Ss'
echo $command
echo -n "Have APIGEE_USER1 ask if APIGEE_USER1 can update http://apigee.com/spec/12345: "
echo -e "\x1B[7m$(eval $command)\x1B[27m" 
echo ''
