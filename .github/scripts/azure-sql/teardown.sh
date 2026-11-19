#!/usr/bin/env bash
# Provisioning workflow (trusted side): deletes every server and per-job app
# registration created for one attempt of a test run.
#
# Requires: TEST_RUN_ID, TEST_RUN_ATTEMPT and the AZURE_* variables.
set -euo pipefail
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

[[ "$TEST_RUN_ID" =~ ^[0-9]+$ && "$TEST_RUN_ATTEMPT" =~ ^[0-9]+$ ]]
prefix="tedious-ci-$TEST_RUN_ID-$TEST_RUN_ATTEMPT-"
status=0

azure_login

# Per-job app registrations of the service principal configs. Only apps the
# provisioner owns can be deleted, and only those have this name prefix.
app_ids=$(az rest --method GET \
  --uri "https://graph.microsoft.com/v1.0/applications?\$filter=startswith(displayName,'$prefix')&\$select=id,displayName" \
  | jq -r --arg prefix "$prefix" '.value[] | select(.displayName | startswith($prefix)) | .id')
for app_id in $app_ids; do
  echo "Deleting app registration $app_id"
  delete_ci_app "$app_id" || status=1
done

# Client secrets on the shared test app, which earlier versions of
# provision.sh created.
app="https://graph.microsoft.com/v1.0/applications(appId='$TEST_APP_CLIENT_ID')"
key_ids=$(az rest --method GET --uri "$app?\$select=passwordCredentials" \
  | jq -r --arg prefix "$prefix" '.passwordCredentials[] | select((.displayName // "") | startswith($prefix)) | .keyId')
for key_id in $key_ids; do
  echo "Removing client secret $key_id"
  az rest --method POST --uri "$app/removePassword" \
    --body "$(jq -n --arg keyId "$key_id" '{keyId: $keyId}')" || status=1
done

servers=$(az sql server list --resource-group "$AZURE_RESOURCE_GROUP" --output json \
  | jq -r --arg prefix "$prefix" '.[] | select(.name | startswith($prefix)) | .name')
for name in $servers; do
  echo "Deleting $name"
  az sql server delete --resource-group "$AZURE_RESOURCE_GROUP" --name "$name" --yes || status=1
done

az logout
exit "$status"
