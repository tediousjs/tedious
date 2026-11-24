#!/usr/bin/env bash
# Provisioning workflow (trusted side): creates an Azure SQL server for one
# test job, waits for the job's request, opens the server's firewall to the
# job's runner and writes the credentials, encrypted to the job's public key,
# to $OUT_DIR/credentials.json.
#
# The server is created before the request arrives, so that this overlaps
# with the test job waiting for a runner and running `npm ci`.
#
# Everything read from the test run (its status, job names and artifacts)
# comes from code in the pull request and is validated before use.
#
# Requires: GH_TOKEN, CONFIG, TEST_RUN_ID, TEST_RUN_ATTEMPT, TEST_RUN_URL,
# SERVER_NAME, OUT_DIR and the AZURE_* variables set by the workflow.
# Sets the step output `found=true` once it starts provisioning, so the
# workflow can report a failure to the test job.
set -euo pipefail
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

[[ "$TEST_RUN_ID" =~ ^[0-9]+$ && "$TEST_RUN_ATTEMPT" =~ ^[0-9]+$ ]]

work=$(mktemp -d)
mkdir -p "$OUT_DIR"
attempt_url="$API/actions/runs/$TEST_RUN_ID/attempts/$TEST_RUN_ATTEMPT"
request_name="azure-sql-request-$TEST_RUN_ATTEMPT-$CONFIG"
credentials_name="azure-sql-credentials-$TEST_RUN_ID-$TEST_RUN_ATTEMPT-$CONFIG"
deadline=$((SECONDS + ${WAIT_SECONDS:-3000}))

skip() {
  echo "$1 Nothing to provision."
  echo "found=false" >> "$GITHUB_OUTPUT"
  exit 0
}

attempt_status() {
  gh_api "$attempt_url" | jq -r .status
}

# 1. Decide whether this config needs a server.
#
# This runs for both the `requested` and `in_progress` events of a test run
# attempt (see azure-sql-provision.yml). Runs for the same attempt are
# serialized, so if another run already published this config's credentials,
# there is nothing left to do.
if find_provisioner_artifact "$credentials_name" > /dev/null; then
  skip "Credentials for $CONFIG were already published."
fi

while :; do
  case $(attempt_status) in
    completed)
      skip "The test run has finished." ;;
    # Fork runs waiting for a maintainer's approval. The `in_progress` event
    # provisions them once they are approved and running.
    action_required | waiting)
      skip "The test run is waiting for approval." ;;
  esac

  jobs=$(gh_api "$attempt_url/jobs?per_page=100")
  if (( $(jq .total_count <<< "$jobs") > 0 )); then
    jq -e --arg config "($CONFIG)" 'any(.jobs[]; .name | contains($config))' <<< "$jobs" > /dev/null \
      || skip "The test run has no $CONFIG job."
    break
  fi

  (( SECONDS < deadline )) || { echo "::error::The test run has no jobs."; exit 1; }
  sleep 10
done

echo "found=true" >> "$GITHUB_OUTPUT"

# 2. Create the server and database. The firewall stays closed until the
#    request arrives.
echo "Creating $SERVER_NAME for $CONFIG"
azure_login

env_json=$(jq -n --arg server "$SERVER_NAME.database.windows.net" '{AZURE_SERVER: $server, AZURE_USERNAME: "tedious"}')
secrets_json='{}'

# The service principal tests get a client secret on the test app that
# expires in two hours. Created first so it has time to propagate.
if [[ "$CONFIG" == "azure-ad-sp-secret" || "$CONFIG" == "token-credential" ]]; then
  body=$(jq -n --arg name "$SERVER_NAME" --arg end "$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ)" \
    '{passwordCredential: {displayName: $name, endDateTime: $end}}')
  client_secret=$(az rest --method POST \
    --uri "https://graph.microsoft.com/v1.0/applications(appId='$TEST_APP_CLIENT_ID')/addPassword" \
    --body "$body" | jq -r .secretText)
  echo "::add-mask::$client_secret"
  secrets_json=$(jq --arg v "$client_secret" '. + {AZURE_AD_SP_CLIENT_SECRET: $v}' <<< "$secrets_json")
fi

if [[ "$CONFIG" != "azure-default" ]]; then
  env_json=$(jq --arg tenant "$AZURE_TENANT_ID" --arg client "$TEST_APP_CLIENT_ID" \
    '. + {AZURE_AD_SP_TENANT_ID: $tenant, AZURE_AD_SP_CLIENT_ID: $client}' <<< "$env_json")
fi

admin_password="Tds-$(openssl rand -hex 24)"
echo "::add-mask::$admin_password"
secrets_json=$(jq --arg v "$admin_password" '. + {AZURE_PASSWORD: $v}' <<< "$secrets_json")

az sql server create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$SERVER_NAME" \
  --location "$AZURE_LOCATION" \
  --admin-user tedious \
  --admin-password "$admin_password" \
  --external-admin-principal-type Group \
  --external-admin-name "$AZURE_SQL_ADMIN_GROUP_NAME" \
  --external-admin-sid "$AZURE_SQL_ADMIN_GROUP_ID" \
  --minimal-tls-version 1.2 \
  --soft-delete-retention-days 0 \
  --tags tedious-ci=true "created-at=$(date -u +%s)" "test-run=$TEST_RUN_URL" \
  --output none

az sql db create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --server "$SERVER_NAME" \
  --name tedious \
  --service-objective "$AZURE_SQL_SERVICE_OBJECTIVE" \
  --backup-storage-redundancy Local \
  --output none

az logout

# 3. Wait for the request. If the test run finishes first, the teardown
#    deletes the server.
echo "Waiting for $request_name"
while :; do
  [[ $(attempt_status) != "completed" ]] || skip "The test run has finished."

  artifact=$(gh_api "$API/actions/runs/$TEST_RUN_ID/artifacts?name=$request_name" \
    | jq -c '[.artifacts[] | select(.expired | not)] | first // empty')
  [[ -z "$artifact" ]] || break

  if (( SECONDS >= deadline )); then
    echo "::error::Timed out waiting for the $request_name artifact."
    exit 1
  fi
  sleep 10
done

# 4. Validate it. Size limit first, then a single IPv4 address and an RSA
#    public key of 3072 to 8192 bits.
(( $(jq .size_in_bytes <<< "$artifact") < 65536 )) || { echo "::error::Request too large."; exit 1; }
gh_api -L "$API/actions/artifacts/$(jq .id <<< "$artifact")/zip" -o "$work/request.zip"
unzip -p "$work/request.zip" request.json | head -c 65536 > "$work/request.json"

runner_ip=$(jq -er '.ip | strings' "$work/request.json")
if ! [[ "$runner_ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] \
  || (( BASH_REMATCH[1] > 255 || BASH_REMATCH[2] > 255 || BASH_REMATCH[3] > 255 || BASH_REMATCH[4] > 255 )) \
  || [[ "$runner_ip" == "0.0.0.0" ]]; then
  echo "::error::Invalid IP address in request."
  exit 1
fi

jq -er '.public_key | strings' "$work/request.json" > "$work/public.pem"
key_text=$(openssl pkey -pubin -in "$work/public.pem" -noout -text 2> /dev/null) \
  || { echo "::error::Invalid public key in request."; exit 1; }
bits=$(sed -n 's/^Public-Key: (\([0-9]*\) bit)$/\1/p' <<< "$key_text" | head -n 1)
if ! grep -q '^Modulus:' <<< "$key_text" || ! (( ${bits:-0} >= 3072 && bits <= 8192 )); then
  echo "::error::The public key must be RSA with 3072 to 8192 bits."
  exit 1
fi

# 5. Open the firewall to the test job's runner. Log in again: the wait can
#    outlast the first login's access token.
echo "Opening $SERVER_NAME to $runner_ip"
azure_login
az sql server firewall-rule create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --server "$SERVER_NAME" \
  --name github-runner \
  --start-ip-address "$runner_ip" \
  --end-ip-address "$runner_ip" \
  --output none
az logout

# 6. Encrypt the secrets to the test job's key.
encrypted=$(printf '%s' "$secrets_json" \
  | openssl pkeyutl -encrypt -pubin -inkey "$work/public.pem" "${OAEP[@]}" | base64 -w 0)
jq -n --argjson env "$env_json" --arg secrets "$encrypted" '{env: $env, secrets: $secrets}' \
  > "$OUT_DIR/credentials.json"
rm -rf "$work"
