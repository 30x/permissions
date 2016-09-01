DIR=$(pwd)
kubectl delete deployment permissions --namespace=apigee
kubectl delete deployment permissions-maintenance --namespace=apigee
kubectl delete deployment teams --namespace=apigee

./k8s-start.sh

cd $DIR