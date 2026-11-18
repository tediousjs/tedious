# Azure SQL CI

`workflows/azure-sql.yml` runs the integration tests against Azure SQL with
four authentication configs (`test/config.*.ts`). Each job creates its own
Azure SQL server and deletes it when it finishes. `workflows/azure-sql-cleanup.yml`
runs every hour and deletes anything a job left behind.

## How a job works

1. Checks out the commit under test (for pull requests, the PR head SHA) into
   `pr/`, then exports it without `.git` into `work/`.
2. **Provision** (runs on the runner, uses only code from this workflow file):
   logs in to Azure with GitHub OIDC (no stored Azure secret), creates the server
   `tedious-ci-<run>-<attempt>-<config>` with
   - a random SQL admin password that only exists for this server,
   - the `AZURE_SQL_ADMIN_GROUP` Entra group as Entra admin,
   - a firewall rule for this runner's IP only,
   - a `tedious` database, and tags `tedious-ci=true` and `created-at=<epoch>`.

   For the service principal configs, it also adds a client secret to the test
   app that expires after two hours.
3. **Test**: runs `npm ci` and the integration tests in a `node:22` container
   (pinned by digest). The container runs as a non-root user with no
   capabilities and `no-new-privileges`. It only gets the variables written for
   this job: the server name and that server's credentials.
4. **Teardown** (`if: always()`, so it also runs on failure and cancellation):
   removes the client secret and deletes the server.
5. Uploads coverage to Codecov, for trusted runs only.

## Pull requests from forks

Pull requests run via `pull_request_target`, so they get the base branch's
workflow and can use OIDC. Runs are **untrusted** when the PR comes from a fork
or is opened by a bot (Dependabot included: a bumped dependency is the most
likely way for malicious code to get in). An untrusted run:

- uses the `azure-sql-external` environment, which should require approval
  from a maintainer before the job starts;
- skips `azure-ad-password`, because that config needs the password of a
  long-lived Entra user;
- skips the Codecov upload.

What the PR's code can get hold of, and what it can do with it:

| Credential | Exposed to PR code? | Scope / lifetime |
| --- | --- | --- |
| Azure OIDC / provisioner identity | No (stays on the host; never passed to the container) | — |
| Actions runtime token (cache) | No | — |
| `GITHUB_TOKEN` | No (`persist-credentials: false`; never passed in) | `contents: read` |
| SQL admin password | Yes | That server only; gone when the server is deleted |
| Test app client secret | Yes (SP configs) | Expires after 2h, removed at teardown; only grants access to CI servers |
| Entra test user password | **Never** for untrusted runs | Long-lived |

Remaining risks, which are why the approval gate is recommended:

- **Container escape.** If the PR's code breaks out of the container (it would
  need a kernel exploit), it can use the job's OIDC token. That gives it
  `Contributor` on the CI resource group, plus control over the test app's
  credentials, until the job ends.
- **Other CI servers.** A leaked test app secret gives admin access to every CI
  server that exists until the secret expires. Those servers are throwaway
  and hold no data.
- **Compute use.** The PR's code can use its own server (S0 by default) until
  teardown or the job timeout (45 min).

## One-time setup

The commands below use these example names. Any names work, as long as the
repository variables match.

```sh
SUB=<subscription id>
RG=tedious-ci
LOCATION=eastus2

az group create --name "$RG" --location "$LOCATION"

# 1. Identity that GitHub Actions logs in as (provisions and deletes servers).
PROVISIONER_APP_ID=$(az ad app create --display-name tedious-ci-provisioner --query appId -o tsv)
PROVISIONER_SP_ID=$(az ad sp create --id "$PROVISIONER_APP_ID" --query id -o tsv)

for env in azure-sql azure-sql-external; do
  az ad app federated-credential create --id "$PROVISIONER_APP_ID" --parameters "{
    \"name\": \"github-$env\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"repo:tediousjs/tedious:environment:$env\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }"
done

# Only on the CI resource group, which should hold nothing else.
az role assignment create --assignee-object-id "$PROVISIONER_SP_ID" \
  --assignee-principal-type ServicePrincipal --role Contributor \
  --scope "/subscriptions/$SUB/resourceGroups/$RG"

# Microsoft Graph Application.ReadWrite.OwnedBy (lets it add and remove
# client secrets on apps it owns, i.e. the test app below).
az ad app permission add --id "$PROVISIONER_APP_ID" \
  --api 00000003-0000-0000-c000-000000000000 \
  --api-permissions 18a4783c-866b-4cc7-a460-3d5e5662c884=Role
az ad app permission admin-consent --id "$PROVISIONER_APP_ID"

# 2. App the tests authenticate as. Public client flows are enabled for the
#    Entra password (ROPC) tests.
TEST_APP_ID=$(az ad app create --display-name tedious-ci-test \
  --is-fallback-public-client true --query appId -o tsv)
TEST_SP_ID=$(az ad sp create --id "$TEST_APP_ID" --query id -o tsv)
az ad app owner add --id "$TEST_APP_ID" --owner-object-id "$PROVISIONER_SP_ID"

# 3. Group that becomes Entra admin of every CI server.
GROUP_ID=$(az ad group create --display-name tedious-ci-sql-admins \
  --mail-nickname tedious-ci-sql-admins --query id -o tsv)
az ad group member add --group "$GROUP_ID" --member-id "$TEST_SP_ID"
az ad group member add --group "$GROUP_ID" --member-id <object id of the Entra test user>
```

Give the test app and the test user **no** other role assignments.

Recommended: add a budget with an alert on the resource group.

### GitHub settings

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

**Environments** (Settings → Environments):

- `azure-sql`
  - Deployment branches: `master`, `alpha`, `beta`, `*.x`. Only reviewed
    workflow code can then log in to Azure. Workflow edits in a PR branch
    cannot.
  - Secrets: `AZURE_AD_USERNAME`, `AZURE_AD_PASSWORD` (the Entra test user).
- `azure-sql-external`
  - Deployment branches: same as above.
  - Required reviewers: the maintainers. Turn on "Prevent self-review" if
    you like.
  - No secrets.

Then delete the old repository secrets `AZURE_SERVER`, `AZURE_USERNAME`,
`AZURE_PASSWORD`, `AZURE_AD_SP_CLIENT_ID`, `AZURE_AD_SP_TENANT_ID`,
`AZURE_AD_SP_CLIENT_SECRET`, `AZURE_AD_USERNAME` and `AZURE_AD_PASSWORD`, and
the old long-lived server.

## Notes

- Because of `pull_request_target`, a PR that changes `azure-sql.yml` runs
  the base branch's version. The change takes effect once it is merged.
- GitHub disables scheduled workflows in public repositories after 60 days
  without activity. Re-enable `Azure SQL cleanup` if that happens.
- `azure-sql-cleanup.yml` can also be started by hand (`workflow_dispatch`).
