#!/usr/bin/env bash
# Test job (untrusted side): waits for the provisioning workflow to publish
# this job's credentials, decrypts them and exports them to later steps.
#
# Requires: GH_TOKEN, CONFIG. Optional: WAIT_SECONDS (default 1200).
set -euo pipefail
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

dir="$RUNNER_TEMP/azure-sql"
name="azure-sql-credentials-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT-$CONFIG"
deadline=$((SECONDS + ${WAIT_SECONDS:-1200}))

echo "Waiting for the Azure SQL provisioning workflow to publish $name"
artifact_id=
while [[ -z "$artifact_id" ]]; do
  candidates=$(gh_api "$API/actions/artifacts?name=$name&per_page=100" \
    | jq -r '.artifacts[] | select(.expired | not) | "\(.id),\(.workflow_run.id)"')
  for candidate in $candidates; do
    # Any pull request run can upload an artifact with this name. Only use
    # the one from the provisioning workflow, which always runs from the
    # default branch.
    if gh_api "$API/actions/runs/${candidate#*,}" | jq -e --arg repo "$GITHUB_REPOSITORY" '
        .event == "workflow_run"
        and .path == ".github/workflows/azure-sql-provision.yml"
        and .head_repository.full_name == $repo' > /dev/null; then
      artifact_id=${candidate%,*}
      break
    fi
  done

  if [[ -z "$artifact_id" ]]; then
    if (( SECONDS >= deadline )); then
      echo "::error::Timed out waiting for the Azure SQL server. Check the 'Azure SQL provisioning' workflow run for this commit."
      exit 1
    fi
    sleep 10
  fi
done

gh_api -L "$API/actions/artifacts/$artifact_id/zip" -o "$dir/credentials.zip"
unzip -p "$dir/credentials.zip" credentials.json > "$dir/credentials.json"

if error=$(jq -er '.error // empty' "$dir/credentials.json"); then
  echo "::error::$error"
  exit 1
fi

secrets=$(jq -r .secrets "$dir/credentials.json" | base64 -d \
  | openssl pkeyutl -decrypt -inkey "$dir/key.pem" "${OAEP[@]}")
rm -f "$dir/key.pem"

jq -r '.[]' <<< "$secrets" | while IFS= read -r value; do
  echo "::add-mask::$value"
done

{
  jq -r '.env | to_entries[] | "\(.key)=\(.value)"' "$dir/credentials.json"
  jq -r 'to_entries[] | "\(.key)=\(.value)"' <<< "$secrets"
} >> "$GITHUB_ENV"

echo "Server ready: $(jq -r .env.AZURE_SERVER "$dir/credentials.json")"
