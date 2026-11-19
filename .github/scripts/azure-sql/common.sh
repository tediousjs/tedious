# Helpers shared by the Azure SQL CI scripts. Sourced, not executed.
# shellcheck shell=bash disable=SC2034  # variables are used by the scripts that source this

API="$GITHUB_API_URL/repos/$GITHUB_REPOSITORY"

# RSA-OAEP with SHA-256, used to encrypt the credentials to the test job's key.
OAEP=(-pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -pkeyopt rsa_mgf1_md:sha256)

# GitHub REST API call with the job's token (GH_TOKEN).
gh_api() {
  curl -sSf --retry 3 \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$@"
}

# Log in to Azure as the provisioner via GitHub OIDC.
azure_login() {
  local token
  token=$(curl -sSf -H "Authorization: Bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
    "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=api://AzureADTokenExchange" | jq -r .value)
  echo "::add-mask::$token"
  az login --service-principal --username "$AZURE_CLIENT_ID" --tenant "$AZURE_TENANT_ID" \
    --federated-token "$token" --output none
  az account set --subscription "$AZURE_SUBSCRIPTION_ID"
}
