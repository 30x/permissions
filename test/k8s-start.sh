DIR=$(pwd)

kubectl delete secret permissions
kubectl create secret generic permissions --from-literal=pguser=${PG_USER} --from-literal=pgpassword=${PG_PASSWORD} --from-literal=pghost=${PG_HOST} --from-literal=pgdatabase=${PG_DATABASE} --namespace=apigee

cd ~/perm/permissions
kubectl create -f k8s-deployment.yaml

cd ~/perm/permissions-maintenance
kubectl create -f k8s-deployment.yaml

cd ~/perm/teams
kubectl create -f k8s-deployment.yaml

cd $DIR