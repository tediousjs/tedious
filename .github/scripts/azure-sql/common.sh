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

# Prints the ID of the newest unexpired artifact called $1 that was uploaded
# by the provisioning workflow, and fails if there is none. Any pull request
# run can upload an artifact with any name, so only artifacts from
# azure-sql-provision.yml (which always runs from the default branch) count.
find_provisioner_artifact() {
  local candidate
  for candidate in $(gh_api "$API/actions/artifacts?name=$1&per_page=100" \
      | jq -r '.artifacts[] | select(.expired | not) | "\(.id),\(.workflow_run.id)"'); do
    if gh_api "$API/actions/runs/${candidate#*,}" | jq -e --arg repo "$GITHUB_REPOSITORY" '
        .event == "workflow_run"
        and .path == ".github/workflows/azure-sql-provision.yml"
        and .head_repository.full_name == $repo' > /dev/null; then
      echo "${candidate%,*}"
      return 0
    fi
  done
  return 1
}
