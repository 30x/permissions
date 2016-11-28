DIR=$(pwd)
cd ~/shipyard-deployment/scripts
echo $(pwd)
unset SSO_LOGIN_URL

rm *.dat
./get_token -u mnally@apigee.com:Richard3 -m 111111
export APIGEE_TOKEN4=$(./get_token)
export APIGEE_USER4=$(python ~/source/permissions/test/get-user-from-token.py ${APIGEE_TOKEN4})

cd $DIR
