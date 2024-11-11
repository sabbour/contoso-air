CLUSTER_RESOURCE_GROUP="demo-eastus2"
CLUSTER_NAME="contosoair"
KEDA_IDENTITY_NAME="contosoair-kedaidentity"
KEDA_FEDERATED_CREDENTIAL_NAME="contosoair-keda-fic"
KEDA_OPERATOR_NAMESPACE="kube-system"
KEDA_OPERATOR_SERVICE_ACCOUNT="keda-operator"
AZURE_MONITOR_WORKSPACE_NAME="defaultazuremonitorworkspace-eastus2"
AZURE_MONITOR_WORKSPACE_RG="defaultresourcegroup-eastus2"

# Create the identity that KEDA will use to authenticate to Azure Monitor
az identity create -n $KEDA_IDENTITY_NAME -g $CLUSTER_RESOURCE_GROUP

# Create the Azure Monitor role assignment for the KEDA identity
AZUREMONITORWORKSPACE_RESOURCE_ID=$(az monitor account show -g $AZURE_MONITOR_WORKSPACE_RG -n $AZURE_MONITOR_WORKSPACE_NAME --query id -o tsv)
KEDA_UAMI_PRINCIPALID=$(az identity show -n ${KEDA_IDENTITY_NAME} -g ${CLUSTER_RESOURCE_GROUP} --query principalId -o tsv)
az role assignment create --assignee ${KEDA_UAMI_PRINCIPALID} --role "Monitoring Data Reader" --scope ${AZUREMONITORWORKSPACE_RESOURCE_ID}

# Create the federated credential for the KEDA operator service acocunt
AKS_OIDC_ISSUER=$(az aks show -n $CLUSTER_NAME -g $CLUSTER_RESOURCE_GROUP --query "oidcIssuerProfile.issuerUrl" -o tsv)
az identity federated-credential create \
    --name $KEDA_FEDERATED_CREDENTIAL_NAME \
    --identity-name $KEDA_IDENTITY_NAME \
    --resource-group $CLUSTER_RESOURCE_GROUP \
    --subject system:serviceaccount:$KEDA_OPERATOR_NAMESPACE:$KEDA_OPERATOR_SERVICE_ACCOUNT \
    --issuer $AKS_OIDC_ISSUER

# Update the client id in the TriggerAuthentication resource
az identity show -n ${KEDA_IDENTITY_NAME} -g ${CLUSTER_RESOURCE_GROUP} --query clientId -o tsv

# Update the Prometheus endpoint in the ScaledObject resource
az resource show --id $AZUREMONITORWORKSPACE_RESOURCE_ID --query "properties.metrics.prometheusQueryEndpoint" -o tsv

# Force a restart for the keda operator deployment to pick up the new trigger authentication
kubectl rollout restart deployment.apps/keda-operator -n kube-system