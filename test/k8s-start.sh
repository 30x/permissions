DIR=$(pwd)

cd ~/source/permissions

source test/k8s-export-pg-connection-variables.sh

kubectl delete secret permissions --namespace=apigee
kubectl create secret generic permissions --from-literal=pguser=${PG_USER} --from-literal=pgpassword=${PG_PASSWORD} --from-literal=pghost=${PG_HOST} --from-literal=pgdatabase=${PG_DATABASE} --namespace=apigee

kubectl create -f k8s-deployment.yaml

cd ~/source/permissions-maintenance
kubectl create -f k8s-deployment.yaml

cd ~/source/permissions-migration
kubectl create -f k8s-deployment.yaml

cd ~/source/teams
kubectl create -f k8s-deployment.yaml

cd $DIR