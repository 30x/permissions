DIR=$(pwd)
kubectl delete deployment permissions --namespace=apigee
kubectl delete deployment permissions-maintenance --namespace=apigee
kubectl delete deployment teams --namespace=apigee
kubectl delete deployment permissions-migration --namespace=apigee
cd $DIR