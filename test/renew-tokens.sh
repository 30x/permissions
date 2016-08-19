DIR=$(pwd)
cd ~/shipyard-deployment/scripts
echo $(pwd)
export SSO_LOGIN_URL="https://login.e2e.apigee.net"

rm *.dat
./get_token -u mnally@apigee.com:Wee00mar -m 111111
export APIGEE_TOKEN1=$(./get_token)
rm *.dat
./get_token -u mnally+1@apigee.com:Wee00mar -m 111111
export APIGEE_TOKEN2=$(./get_token)

rm *.dat
./get_token -u mnally+2@apigee.com:Wee00mar -m 111111
export APIGEE_TOKEN3=$(./get_token)

cd $DIR
