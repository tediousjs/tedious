#!/usr/bin/env bash
# Provisioning workflow (trusted side): deletes every server and test app
# client secret created for one attempt of a test run.
#
# Requires: TEST_RUN_ID, TEST_RUN_ATTEMPT and the AZURE_* variables.
set -euo pipefail
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

[[ "$TEST_RUN_ID" =~ ^[0-9]+$ && "$TEST_RUN_ATTEMPT" =~ ^[0-9]+$ ]]
prefix="tedious-ci-$TEST_RUN_ID-$TEST_RUN_ATTEMPT-"
status=0

azure_login

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
