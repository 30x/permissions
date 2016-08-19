DIR=$(pwd)
kubectl delete deployment permissions --namespace=apigee
kubectl delete deployment permissions-maintenance --namespace=apigee
kubectl delete deployment teams --namespace=apigee

cd ~/perm/permissions
kubectl create -f k8s-deployment.yaml

cd ~/perm/permissions-maintenance
kubectl create -f k8s-deployment.yaml

cd ~/perm/teams
kubectl create -f k8s-deployment.yaml

cd $DIR