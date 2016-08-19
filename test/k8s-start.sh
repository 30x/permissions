DIR=$(pwd)

cd ~/perm/permissions
kubectl create -f k8s-deployment.yaml

cd ~/perm/permissions-maintenance
kubectl create -f k8s-deployment.yaml

cd ~/perm/teams
kubectl create -f k8s-deployment.yaml

cd $DIR