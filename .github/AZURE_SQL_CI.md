# Azure SQL CI

The integration tests run against Azure SQL with four authentication configs
(`test/config.*.ts`). Each test job gets its own Azure SQL server, which is
deleted when the test run finishes. Three workflows are involved:

| Workflow | Trigger | Azure access | Runs pull request code |
| --- | --- | --- | --- |
| `workflows/azure-sql.yml` | `push`, `pull_request` | None | Yes |
| `workflows/azure-sql-provision.yml` | `workflow_run` (creation, start and end of each test run) | Yes, via OIDC | Never |
| `workflows/azure-sql-cleanup.yml` | Hourly | Yes, via OIDC | Never |

## How a test run works

1. **Request.** Each test job (`request-server.sh`) creates a one-time RSA
   key pair and uploads a request artifact with this runner's IP and the
   public key.
2. **Provision.** As soon as the test run is created (its `requested`
   event, before its jobs have runners), `azure-sql-provision.yml` runs one
   job per config (`provision.sh`). Each job:
   - creates the server `tedious-ci-<run>-<attempt>-<config>` right away, with
     a random SQL admin password that only exists for this server, the
     `tedious-ci-sql-admins` Entra group as Entra admin, a `tedious` database,
     and tags `tedious-ci=true` and `created-at=<epoch>`. For the service
     principal configs, it also adds a client secret that expires after two
     hours to the test app;
   - waits for its test job's request and validates it (a single IPv4
     address, an RSA key of 3072 to 8192 bits, size limits);
   - opens the server's firewall to the requesting runner's IP only;
   - uploads the passwords, encrypted to the test job's public key (RSA-OAEP,
     SHA-256), as a credentials artifact.

   Creating the server overlaps with the test job waiting for a runner and
   running `npm ci`. GitHub doesn't send `requested` for re-runs, and a fork
   run that is still waiting for approval is skipped on `requested`. Both are
   provisioned on the later `in_progress` event, which GitHub only sends once
   all of the run's jobs have started. Runs for the same attempt are
   serialized, so a second provisioning run finds the credentials already
   published and skips.
3. **Test.** The test job (`wait-for-server.sh`) waits for its credentials
   artifact and accepts it only if it was uploaded by `azure-sql-provision.yml`
   running from the default branch. It decrypts the credentials, deletes the
   private key and runs the integration tests.
4. **Teardown.** When the test run completes (passed, failed or cancelled),
   `azure-sql-provision.yml` runs again (`teardown.sh`) and deletes all
   servers and client secrets for that run attempt. A concurrency group makes
   the teardown wait for any provisioning still in progress.
5. **Fallback.** `azure-sql-cleanup.yml` deletes tagged servers and test app
   client secrets more than two hours old.

## Pull requests from forks

Fork pull requests run `azure-sql.yml` like any other `pull_request`
workflow: from the pull request's own code, with a read-only `GITHUB_TOKEN`
and no secrets. Nothing that can reach Azure ever runs on the same machine as
pull request code. The provisioning workflow runs from the default branch
and treats the request artifacts and job list as untrusted input.

This uses neither `pull_request_target` nor `allow-unsafe-pr-checkout`.

What pull request code can get hold of:

| Credential | Exposed to PR code? | Scope / lifetime |
| --- | --- | --- |
| Azure OIDC / provisioner identity | No (only in `azure-sql-provision.yml`) | — |
| `GITHUB_TOKEN` | Read-only | `contents: read`, `actions: read` |
| SQL admin password | Yes | That server only; gone when the server is deleted |
| Test app client secret | Yes (SP configs) | Expires after 2h, removed at teardown; only grants access to CI servers |
| Entra test user password | Never for forks or Dependabot | Long-lived repository secret |

Remaining risks:

- **Other CI servers.** A leaked test app secret gives admin access to every CI
  server that exists until the secret expires. Those servers are throwaway
  and hold no data.
- **Compute use.** A pull request controls its own copy of `azure-sql.yml`. It
  can get at most four servers (S0 by default) per run attempt, for as long as
  its run lasts. The cleanup workflow deletes them after two hours at most.
  That's why approval for outside contributors' runs is recommended
  (see "GitHub settings" below).
- **Spoofed requests.** Anyone whose run is approved can trigger provisioning,
  including from a workflow they add that is also named "Azure SQL". It still
  gets at most four servers per run attempt, each reachable only from the IP
  in its request.

## One-time setup

You need:

- **Azure:** Owner (or User Access Administrator) on the subscription, to
  create the resource group and assign a role on it.
- **Entra ID:** Privileged Role Administrator or Global Administrator, to grant
  the provisioner its Microsoft Graph permission. Everything else only needs
  the right to create apps and groups.

Run these with your own `az login`. They use these example names; any names
work, as long as the repository variables match.

```sh
SUB=<subscription id>
TENANT=<tenant id>
RG=tedious-ci
LOCATION=eastus2
az account set --subscription "$SUB"

# 0. The resource group holds only CI servers: anything in it older than
#    two hours with the `tedious-ci` tag gets deleted. The provisioner can't
#    register resource providers, so register Microsoft.Sql now (no-op if
#    already registered).
az provider register --namespace Microsoft.Sql --wait
az group create --name "$RG" --location "$LOCATION"
```

### 1. The provisioner (what GitHub Actions logs in as)

An app registration with no secret. GitHub Actions logs in with OIDC
through a federated credential for the `azure-sql` environment, which only
the provisioning and cleanup workflows use.

```sh
PROVISIONER_APP_ID=$(az ad app create --display-name tedious-ci-provisioner --query appId -o tsv)
PROVISIONER_SP_ID=$(az ad sp create --id "$PROVISIONER_APP_ID" --query id -o tsv)

az ad app federated-credential create --id "$PROVISIONER_APP_ID" --parameters '{
  "name": "github-tediousjs-tedious-azure-sql",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:tediousjs/tedious:environment:azure-sql",
  "audiences": ["api://AzureADTokenExchange"]
}'

# Contributor on the CI resource group only.
az role assignment create --assignee-object-id "$PROVISIONER_SP_ID" \
  --assignee-principal-type ServicePrincipal --role Contributor \
  --scope "/subscriptions/$SUB/resourceGroups/$RG"

# Microsoft Graph Application.ReadWrite.OwnedBy, granted directly as an app
# role assignment (the same thing admin consent does). It lets the
# provisioner add and remove client secrets on apps it owns.
GRAPH_SP_ID=$(az ad sp show --id 00000003-0000-0000-c000-000000000000 --query id -o tsv)
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/servicePrincipals/$PROVISIONER_SP_ID/appRoleAssignments" \
  --body "{
    \"principalId\": \"$PROVISIONER_SP_ID\",
    \"resourceId\": \"$GRAPH_SP_ID\",
    \"appRoleId\": \"18a4783c-866b-4cc7-a460-3d5e5662c884\"
  }"
```

Do **not** make the provisioner an owner of its own app registration. With
`Application.ReadWrite.OwnedBy`, that would let it add credentials to itself,
for example a federated credential for some other repository.

Use an app registration here, not a user-assigned managed identity in the
CI resource group: `Contributor` on that group would let the provisioner add
federated credentials to such an identity.

### 2. The test app (what the tests authenticate as)

If the current CI setup's app (the old `AZURE_AD_SP_CLIENT_ID` secret) already
has public client flows enabled, you can reuse it instead of creating one.
Just make the provisioner an owner and delete its old long-lived client secret.

```sh
TEST_APP_ID=$(az ad app create --display-name tedious-ci-test \
  --is-fallback-public-client true --query appId -o tsv)
TEST_SP_ID=$(az ad sp create --id "$TEST_APP_ID" --query id -o tsv)

# Lets the provisioner mint and remove the short-lived client secrets.
az ad app owner add --id "$TEST_APP_ID" --owner-object-id "$PROVISIONER_SP_ID"
```

Give the test app **no** Azure role assignments and no Graph permissions. Its
only access is via the group below.

If your tenant has an app management policy that blocks or limits password
credentials, it must allow client secrets on this app with a lifetime of at
least two hours.

### 3. The Entra test user (for `azure-ad-password` only)

The existing test user can stay. The Entra password tests use ROPC, so the
user must:

- be a cloud-only account, not federated or synced, with no MFA;
- not be covered by security defaults or any Conditional Access policy that
  requires MFA (exclude it explicitly);
- have no Azure role assignments.

These tests never run for pull requests from forks or Dependabot.

### 4. The admin group

Every CI server gets this group as its Entra admin, which gives its members
`dbo` on the `tedious` database. Service principals can log in to Azure SQL
through group membership. No server identity or Directory Readers role is
needed, because nothing runs `CREATE USER ... FROM EXTERNAL PROVIDER`.

```sh
GROUP_ID=$(az ad group create --display-name tedious-ci-sql-admins \
  --mail-nickname tedious-ci-sql-admins --query id -o tsv)
az ad group member add --group "$GROUP_ID" --member-id "$TEST_SP_ID"
az ad group member add --group "$GROUP_ID" --member-id "$(az ad user show --id <test user UPN> --query id -o tsv)"
```

The group must contain only the test app and the test user.

### 5. Budget alert (recommended)

In the portal: Cost Management → Budgets → add a monthly budget scoped to
the `tedious-ci` resource group, with an email alert. That catches
leftover servers even if both teardown and the cleanup workflow fail.

### 6. Dry run (optional, before merging)

The workflows can only run once they're on `master`. To check the Azure side
first, run what a job does, logged in as yourself:

```sh
NAME=tedious-ci-dryrun-$(date +%s)
PW="Tds-$(openssl rand -hex 24)"
az sql server create -g "$RG" -n "$NAME" -l "$LOCATION" -u tedious -p "$PW" \
  --external-admin-principal-type Group --external-admin-name tedious-ci-sql-admins \
  --external-admin-sid "$GROUP_ID" --minimal-tls-version 1.2 \
  --soft-delete-retention-days 0 --tags tedious-ci=true "created-at=$(date -u +%s)"
az sql server firewall-rule create -g "$RG" -s "$NAME" -n me \
  --start-ip-address "$(curl -s https://api.ipify.org)" --end-ip-address "$(curl -s https://api.ipify.org)"
az sql db create -g "$RG" -s "$NAME" -n tedious --service-objective S0 --backup-storage-redundancy Local

# Then, from a tedious checkout:
#   cp test/config.azure-default.ts test/config.ts
#   AZURE_SERVER=$NAME.database.windows.net AZURE_USERNAME=tedious AZURE_PASSWORD=$PW \
#     npm run test-integration
# and the same with a temporary client secret on the test app for
# test/config.azure-ad-sp-secret.ts.

az sql server delete -g "$RG" -n "$NAME" --yes
```

If you skip this, the first push to `master` after merging is the first
real run. If its teardown fails, the cleanup workflow deletes the server
within the next hour.


### 7. GitHub settings

**Repository variables** (Settings → Secrets and variables → Actions →
Variables). None of these are secret:

| Variable | Value |
| --- | --- |
| `AZURE_CLIENT_ID` | `$PROVISIONER_APP_ID` |
| `AZURE_TENANT_ID` | tenant id |
| `AZURE_SUBSCRIPTION_ID` | `$SUB` |
| `AZURE_SQL_RESOURCE_GROUP` | `$RG` |
| `AZURE_SQL_ADMIN_GROUP_NAME` | `tedious-ci-sql-admins` |
| `AZURE_SQL_ADMIN_GROUP_ID` | `$GROUP_ID` |
| `AZURE_TEST_APP_CLIENT_ID` | `$TEST_APP_ID` |
| `AZURE_SQL_LOCATION` | optional, defaults to `eastus2` |
| `AZURE_SQL_SERVICE_OBJECTIVE` | optional, defaults to `S0` |

**Repository secrets:** `AZURE_AD_USERNAME` and `AZURE_AD_PASSWORD` (the
Entra test user). GitHub does not pass repository secrets to runs from forks
or Dependabot. Keep `CODECOV_TOKEN` as it is.

**Environment** (Settings → Environments): `azure-sql`, with deployment
branches limited to the default branch (`master`). Both workflows that use it
always run from there. No secrets, and no required reviewers needed.

**Fork pull request approval** (Settings → Actions → General → "Approval for
running fork pull request workflows from contributors"): "Require approval for
all external contributors" is recommended. A maintainer then approves each
fork run before it starts, and provisioning only starts once it does.

**Lockfile:** run `gh actions-lock` and commit `.github/workflows/actions.lock`.
It needs an entry for `actions/upload-artifact`, which was added by hand
without one.

Then delete the old repository secrets `AZURE_SERVER`, `AZURE_USERNAME`,
`AZURE_PASSWORD`, `AZURE_AD_SP_CLIENT_ID`, `AZURE_AD_SP_TENANT_ID` and
`AZURE_AD_SP_CLIENT_SECRET`, and the old long-lived server.

## Notes

- `azure-sql-provision.yml` runs from the default branch, so changes to it,
  or to `provision.sh`, `teardown.sh` or `common.sh`, take effect once
  merged. Changes to `azure-sql.yml`, `request-server.sh` and
  `wait-for-server.sh` run in the pull request itself.
- The provisioning workflow finds the test workflow by its name ("Azure SQL")
  and its jobs by the `(<config>)` part of their names. Keep both when
  editing `azure-sql.yml`.
- GitHub disables scheduled workflows in public repositories after 60 days
  without activity. Re-enable `Azure SQL cleanup` if that happens.
- `azure-sql-cleanup.yml` can also be started by hand (`workflow_dispatch`).
