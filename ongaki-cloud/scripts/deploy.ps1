param(
  [string]$Environment = "prod",
  [string]$KubeContext = "ongaki-prod-af-east-1"
)

$ErrorActionPreference = "Stop"

kubectl config use-context $KubeContext
terraform -chdir="infra/terraform" init
terraform -chdir="infra/terraform" apply -auto-approve
kubectl apply -f "infra/kubernetes/base.yaml"
kubectl apply -f "infra/kubernetes/security-policies.yaml"

Write-Host "Ongaki Cloud $Environment control plane deployment submitted to $KubeContext."

