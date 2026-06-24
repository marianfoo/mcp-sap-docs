# SAP BTP Cloud Foundry Deployment

This guide deploys the `sap-docs` variant as a public Streamable HTTP MCP server
on SAP BTP Cloud Foundry.

Recommended deployment model: run a prebuilt Docker image on Cloud Foundry and
manage the app with MTA. The default image is:

```text
ghcr.io/marianfoo/mcp-sap-docs:sap-docs
```

You can replace that image with your own registry image if your organization
requires a private registry or a controlled build pipeline.

## Recommended Model

The `sap-docs` profile contains a large offline documentation corpus plus
semantic embeddings. Cloud Foundry should pull and run that prepared image; it
should not clone all documentation sources and build the index during staging.

The recommended flow is:

1. Deploy an existing semantic Docker image to BTP CF.
2. Use MTA for app name, route, resource settings, and later service bindings.
3. Use SAP Job Scheduling Service to trigger a daily redeploy so CF pulls the
   current image tag.

Docker is not required on the BTP CF side. CF only needs Docker-image support
and access to the configured registry. Docker is only needed if you build your
own image.

Use the Node.js buildpack only if your platform cannot run Docker images or your
compliance rules require staging from source. For the current full `sap-docs`
corpus, the Node.js buildpack path is not recommended because staging has to
handle a large app package, dependencies, droplet copy, and compression.

Reference docs:

- [Cloud Foundry: deploying an app based on a Docker image](https://docs.cloudfoundry.org/devguide/deploy-apps/push-docker.html)
- [SAP BTP: deploy Docker images in the Cloud Foundry environment](https://help.sap.com/docs/btp/sap-business-technology-platform/deploy-docker-images-in-cloud-foundry-environment)
- [Cloud Foundry: deploying large apps](https://docs.cloudfoundry.org/devguide/deploy-apps/large-app-deploy.html)
- [SAP Job Scheduling Service](https://help.sap.com/doc/234ab5b017b14bfa9d96152c5d9335e7/Cloud/en-US/jobscheduler.pdf)
- [Cloud Foundry: running tasks in your apps](https://docs.cloudfoundry.org/devguide/using-tasks.html)

## Semantic Embeddings

Semantic embeddings are recommended for `sap-docs` because they improve
natural-language and paraphrase-heavy searches. They are not required for the
server to start.

With embeddings:

- Search quality is better for meaning-based queries.
- The image is larger because `docs.sqlite` contains vectors and `dist/models`
  contains `Xenova/all-MiniLM-L6-v2`.
- Startup memory is higher when `MCP_PRELOAD_EMBEDDINGS=true`.

Without embeddings:

- BM25/FTS search, fetch, and online sources still work.
- The image is smaller and faster to build.
- Semantic reranking is not available.

Recommended semantic defaults:

- memory: `1024M`
- disk quota: `6144M`
- instances: `1`
- `MCP_PRELOAD_EMBEDDINGS=true`

FTS-only fallback defaults:

- memory: `512M`
- disk quota: `4096M`
- instances: `1`
- `MCP_PRELOAD_EMBEDDINGS=false`

## Prerequisites

- `cf` CLI installed.
- `mbt` installed for MTA deployment.
- A BTP CF org and space where you have `SpaceDeveloper`.
- Access to the Docker image you configure.
- Docker installed only if you build your own image.
- `jobscheduler` entitlement and quota if you want daily refreshes.

Target the destination org and space before deploying. The MTA descriptor does
not contain the org or space; it deploys to the current `cf target`.

macOS/Linux and Windows PowerShell:

```bash
cf api https://api.cf.<region>.hana.ondemand.com
cf login --sso
cf target -o "<org>" -s "<space>"
cf target
```

Use `cf domains` to see the route domains available in your CF space.

## Container Image Options

Most users should deploy the maintained image:

```text
ghcr.io/marianfoo/mcp-sap-docs:sap-docs
```

If you need your own build, publish an equivalent image to your registry and use
that image reference everywhere this guide uses the default image.

Build and push a semantic image on macOS/Linux:

```bash
docker build \
  --platform linux/amd64 \
  --build-arg MCP_VARIANT=sap-docs \
  --build-arg BUILD_EMBEDDINGS=true \
  -t registry.example.com/team/mcp-sap-docs:sap-docs \
  .

docker push registry.example.com/team/mcp-sap-docs:sap-docs
```

Build and push a semantic image on Windows PowerShell:

```powershell
docker build `
  --platform linux/amd64 `
  --build-arg MCP_VARIANT=sap-docs `
  --build-arg BUILD_EMBEDDINGS=true `
  -t registry.example.com/team/mcp-sap-docs:sap-docs `
  .

docker push registry.example.com/team/mcp-sap-docs:sap-docs
```

For an FTS-only image, set `BUILD_EMBEDDINGS=false` and deploy with
`MCP_PRELOAD_EMBEDDINGS=false`.

If you pin an image by digest, remember that the digest changes whenever a new
image is built. For daily refreshes, use a moving tag such as `sap-docs`. Use a
digest only when you intentionally want a fixed, reproducible deployment.

## Deploy with MTA

Copy the extension template and adapt it for your landscape.

macOS/Linux:

```bash
cp mta-overrides.mtaext.example mta-overrides.mtaext
${EDITOR:-vi} mta-overrides.mtaext
```

Windows PowerShell:

```powershell
Copy-Item mta-overrides.mtaext.example mta-overrides.mtaext
notepad mta-overrides.mtaext
```

In `mta-overrides.mtaext`, adapt:

- `docker.image` if you use your own registry image.
- `routes` if you want a stable route for MCP clients.
- `memory` and `disk-quota` only if you intentionally deviate from the semantic
  defaults.
- `MCP_PRELOAD_EMBEDDINGS` if you use an FTS-only image.

Example route override:

```yaml
routes:
  - route: mcp-sap-docs.<your-cf-domain>
```

Build and deploy on macOS/Linux:

```bash
mbt build
MTAR="$(ls -t mta_archives/mcp-sap-docs-btp-cf_*.mtar | head -n 1)"
cf deploy "$MTAR" -e mta-overrides.mtaext
```

Build and deploy on Windows PowerShell:

```powershell
mbt build
$Mtar = Get-ChildItem -Path "mta_archives" -Filter "mcp-sap-docs-btp-cf_*.mtar" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
cf deploy $Mtar.FullName -e mta-overrides.mtaext
```

If you do not create `mta-overrides.mtaext`, CF/MTA can still deploy the app,
but it may assign a generated route.

## Fast Trial with `cf push`

Use direct `cf push` when you want to quickly validate CF quota, route, and image
startup before using MTA. This does not create an MTA deployment record.

Using the manifest:

```bash
cf push -f manifest-btp-cf-sap-docs.yml
```

One-off semantic trial on macOS/Linux:

```bash
cf push mcp-sap-docs \
  --docker-image ghcr.io/marianfoo/mcp-sap-docs:sap-docs \
  --no-manifest \
  -m 1024M \
  -k 6144M \
  -i 1 \
  -u http \
  --endpoint /health \
  -t 240
```

One-off semantic trial on Windows PowerShell:

```powershell
cf push mcp-sap-docs `
  --docker-image ghcr.io/marianfoo/mcp-sap-docs:sap-docs `
  --no-manifest `
  -m 1024M `
  -k 6144M `
  -i 1 `
  -u http `
  --endpoint /health `
  -t 240
```

If you use your own image, replace the `--docker-image` value.

Useful commands:

```bash
cf app mcp-sap-docs
cf logs mcp-sap-docs --recent
cf delete mcp-sap-docs -f -r
```

## Verify

Get the route and current app state:

```bash
cf app mcp-sap-docs
```

Health check on macOS/Linux:

```bash
curl -sS https://<route>/health
```

Health check on Windows PowerShell:

```powershell
Invoke-RestMethod -Uri "https://<route>/health"
```

The Streamable HTTP MCP endpoint is `/mcp`. The web app exposes `/health`; a
404 on `/status` is not a deployment failure for this server.

Logs:

```bash
cf logs mcp-sap-docs --recent
```

## Public-First Security Notes

This first deployment is intentionally public and unauthenticated.

Operational guardrails for that phase:

- It exposes documentation/search only, not SAP system access.
- It should not bind XSUAA or Destination services yet.
- Keep route names deployment-specific.
- Watch `cf logs` for expensive or repeated requests.
- Do not set secrets in `manifest-btp-cf-sap-docs.yml`, `mta.yaml`, or
  `mta-overrides.mtaext`.

Later protection should add XSUAA and MCP OAuth metadata as a separate change.

## Resource Tuning

Default deployment values for the recommended semantic profile:

- memory: `1024M`
- disk quota: `6144M`
- instances: `1`
- embeddings preload: `true`

These defaults were validated with the semantic image. The observed disk usage
was above `4G`, so `6144M` is intentional headroom for image layer expansion,
model files, vector data, and future source growth.

Parameter guidance:

| Parameter | Default | Why it matters |
| --- | --- | --- |
| `memory` / `-m` | `1024M` | Runtime RAM per app instance. Embedding preload keeps the model resident so the first semantic query is not slow. |
| `disk-quota` / `disk_quota` / `-k` | `6144M` | CF Docker apps need enough disk for the uncompressed image filesystem. Use `4096M` only for FTS-only fallback. |
| `instances` / `-i` | `1` | One instance minimizes quota use. Use more only when you need availability during deploys or platform maintenance. |
| `MCP_PRELOAD_EMBEDDINGS` | `true` | Loads the embedding model at startup. Set false for FTS-only or if you deliberately prefer lazy first-query loading. |
| `health-check-type` | `http` | Confirms the app can serve `/health`, not only that a port opened. |
| `timeout` / `-t` | `180-240` | Large images can take longer to pull/start. The allowed maximum is foundation-specific. |

If startup fails, tune in this order:

1. Increase `disk-quota` if CF reports image layer, filesystem, or disk quota
   problems.
2. Increase `memory` if the app exits during embedding preload.
3. Set `MCP_PRELOAD_EMBEDDINGS=false` only if you need to reduce startup memory.
4. Use an FTS-only image only when quota is too tight for semantic search.

Do not run `MCP_VARIANT=sap-docs npm run setup && npm run build` inside a small
CF staging container unless you intentionally choose the Node.js buildpack path.

## Node.js Buildpack Package Result

The full `sap-docs` corpus was tested as a prebuilt FTS-only Node.js package
with vendored production dependencies and `MCP_PRELOAD_EMBEDDINGS=false`.

Observed outcome:

- `512M` memory was enough for runtime, but staging did not complete.
- `3G` and `4G` disk failed while copying the compiled droplet.
- `5G` disk failed while compressing the droplet.
- Each attempt spent roughly 10-15 minutes in upload/package/staging before
  failing.

Use Docker image deployment for the current corpus. Revisit the Node.js
buildpack path only after pruning large source payloads or moving the corpus to
external storage.

## Manual Refresh on BTP CF

A manual refresh means "redeploy the same app from the current image tag." CF
then pulls the current image and replaces the app instance.

Direct manual refresh on macOS/Linux:

```bash
cf push mcp-sap-docs \
  --docker-image ghcr.io/marianfoo/mcp-sap-docs:sap-docs \
  --no-manifest \
  -m 1024M \
  -k 6144M \
  -i 1 \
  -u http \
  --endpoint /health \
  -t 240
```

Direct manual refresh on Windows PowerShell:

```powershell
cf push mcp-sap-docs `
  --docker-image ghcr.io/marianfoo/mcp-sap-docs:sap-docs `
  --no-manifest `
  -m 1024M `
  -k 6144M `
  -i 1 `
  -u http `
  --endpoint /health `
  -t 240
```

If you use MTA for route and service binding ownership, prefer redeploying the
MTA instead of direct `cf push`:

macOS/Linux:

```bash
mbt build
MTAR="$(ls -t mta_archives/mcp-sap-docs-btp-cf_*.mtar | head -n 1)"
cf deploy "$MTAR" -e mta-overrides.mtaext
```

Windows PowerShell:

```powershell
mbt build
$Mtar = Get-ChildItem -Path "mta_archives" -Filter "mcp-sap-docs-btp-cf_*.mtar" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
cf deploy $Mtar.FullName -e mta-overrides.mtaext
```

If you already set up the deployer app from the next section, you can also run
the scheduled refresh task manually.

macOS/Linux:

```bash
REFRESH_COMMAND='sh -lc '\''set -eu; cf api "$CF_API"; if [ -n "${CF_CLIENT_ID:-}" ]; then cf auth "$CF_CLIENT_ID" "$CF_CLIENT_SECRET" --client-credentials; elif [ -n "${CF_ORIGIN:-}" ]; then cf auth "$CF_USERNAME" "$CF_PASSWORD" --origin "$CF_ORIGIN"; else cf auth "$CF_USERNAME" "$CF_PASSWORD"; fi; cf target -o "$CF_ORG" -s "$CF_SPACE"; cf push "$MCP_APP_NAME" --docker-image "$MCP_IMAGE" --no-manifest -m "$MCP_MEMORY" -k "$MCP_DISK" -i 1 -u http --endpoint /health -t 240'\'''

cf run-task mcp-sap-docs-deployer \
  --name refresh-mcp-sap-docs \
  -m 64M \
  -k 512M \
  --command "$REFRESH_COMMAND" \
  --wait
```

Windows PowerShell:

```powershell
$RefreshCommand = @'
sh -lc 'set -eu; cf api "$CF_API"; if [ -n "${CF_CLIENT_ID:-}" ]; then cf auth "$CF_CLIENT_ID" "$CF_CLIENT_SECRET" --client-credentials; elif [ -n "${CF_ORIGIN:-}" ]; then cf auth "$CF_USERNAME" "$CF_PASSWORD" --origin "$CF_ORIGIN"; else cf auth "$CF_USERNAME" "$CF_PASSWORD"; fi; cf target -o "$CF_ORG" -s "$CF_SPACE"; cf push "$MCP_APP_NAME" --docker-image "$MCP_IMAGE" --no-manifest -m "$MCP_MEMORY" -k "$MCP_DISK" -i 1 -u http --endpoint /health -t 240'
'@

cf run-task mcp-sap-docs-deployer `
  --name refresh-mcp-sap-docs `
  -m 64M `
  -k 512M `
  --command $RefreshCommand `
  --wait
```

Use `-m` and `-k` for CF task memory and disk. Some CF CLI versions reject
longer `--memory` or `--disk` flags for `cf run-task`.

## Daily Resource Refresh

The deployed app should be immutable. Do not run `git pull`, `npm run build`, or
`npm run build:embeddings` inside the running MCP web container. The refresh
operation should redeploy from a fresh image tag.

Recommended BTP-only refresh:

```text
SAP Job Scheduling Service
  -> Cloud Foundry task at 05:00 UTC
  -> small deployer app with CF CLI
  -> cf push <mcp-app> --docker-image <image>
  -> CF pulls the current image tag
```

This keeps the MCP server focused on serving requests and makes refreshes
visible in the user's BTP CF space.

### Create the Scheduler and Deployer

Create the scheduler service instance:

```bash
cf create-service jobscheduler free mcp-sap-docs-scheduler
```

The `free` plan is enough for one daily trial/dev refresh when it is entitled in
the subaccount.

Create a small no-route deployer app:

macOS/Linux:

```bash
cf push mcp-sap-docs-deployer \
  --docker-image cloudfoundry/cli:8.18.0 \
  --no-manifest \
  --no-route \
  -m 64M \
  -k 512M \
  -i 1 \
  -u process \
  -c "sleep 86400" \
  -t 120
```

Windows PowerShell:

```powershell
cf push mcp-sap-docs-deployer `
  --docker-image cloudfoundry/cli:8.18.0 `
  --no-manifest `
  --no-route `
  -m 64M `
  -k 512M `
  -i 1 `
  -u process `
  -c "sleep 86400" `
  -t 120
```

Set target deployment values on the deployer app:

```bash
cf set-env mcp-sap-docs-deployer CF_API "https://api.cf.<region>.hana.ondemand.com"
cf set-env mcp-sap-docs-deployer CF_ORG "<org>"
cf set-env mcp-sap-docs-deployer CF_SPACE "<space>"
cf set-env mcp-sap-docs-deployer MCP_APP_NAME "mcp-sap-docs"
cf set-env mcp-sap-docs-deployer MCP_IMAGE "ghcr.io/marianfoo/mcp-sap-docs:sap-docs"
cf set-env mcp-sap-docs-deployer MCP_MEMORY "1024M"
cf set-env mcp-sap-docs-deployer MCP_DISK "6144M"
```

If you use your own registry image, set `MCP_IMAGE` to that image reference.

The scheduler task reads these environment variables. If you later change app
name, image, memory, or disk, update the deployer environment and restart/stop
the deployer once. You do not need to edit the dashboard action.

### Configure CF Deploy Credentials

Use a dedicated technical user or CF UAA client that can authenticate without
browser SSO. A personal user is acceptable for trial/dev only if it works with
non-interactive `cf auth`.

Password-based platform user:

```bash
cf set-env mcp-sap-docs-deployer CF_USERNAME "<platform-user>"
cf set-env mcp-sap-docs-deployer CF_ORIGIN "<origin>"
```

Set the password on macOS/Linux:

```bash
printf "CF password: "
stty -echo
IFS= read -r CF_PASSWORD
stty echo
printf "\n"
cf set-env mcp-sap-docs-deployer CF_PASSWORD "$CF_PASSWORD"
unset CF_PASSWORD
```

Set the password on Windows PowerShell:

```powershell
$Secure = Read-Host "CF password" -AsSecureString
$Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
try {
  $Plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr)
  cf set-env mcp-sap-docs-deployer CF_PASSWORD $Plain
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr)
  Remove-Variable Plain -ErrorAction SilentlyContinue
  Remove-Variable Secure -ErrorAction SilentlyContinue
}
```

For SAP ID service users, the origin is usually `sap.ids`. For a custom SAP
Cloud Identity Services trust, use the origin shown in the BTP cockpit under CF
org/space members.

Assign the platform user to the target space:

```bash
cf set-space-role "<platform-user>" "<org>" "<space>" SpaceDeveloper --origin "<origin>"
```

Client-credential based CF UAA identity:

```bash
cf set-env mcp-sap-docs-deployer CF_CLIENT_ID "<cf-uaa-client-id>"
cf set-space-role "<cf-uaa-client-id>" "<org>" "<space>" SpaceDeveloper --client
```

Set `CF_CLIENT_SECRET` with the same secure prompt pattern shown for
`CF_PASSWORD`, replacing the variable name with `CF_CLIENT_SECRET`.

Do not reuse credentials from a Job Scheduling Service binding as CF deploy
credentials. Those credentials are for the scheduler service API, not for CF app
deployment.

Bind the scheduler service and stop the deployer:

```bash
cf bind-service mcp-sap-docs-deployer mcp-sap-docs-scheduler
cf restart mcp-sap-docs-deployer
cf stop mcp-sap-docs-deployer
```

The deployer is stopped between runs. The scheduler starts short-lived CF tasks
from it.

### Create the Dashboard Task

Get the dashboard URL:

```bash
cf service mcp-sap-docs-scheduler
```

In the Job Scheduling Service dashboard:

1. Choose **Tasks**, not **Jobs**.
2. Create a task named `mcp_sap_docs_refresh`. Use underscores; the dashboard
   rejects hyphens in CF task names.
3. Set **Application** to `mcp-sap-docs-deployer`.
4. Paste this action:

```bash
sh -lc 'set -eu; cf api "$CF_API"; if [ -n "${CF_CLIENT_ID:-}" ]; then cf auth "$CF_CLIENT_ID" "$CF_CLIENT_SECRET" --client-credentials; elif [ -n "${CF_ORIGIN:-}" ]; then cf auth "$CF_USERNAME" "$CF_PASSWORD" --origin "$CF_ORIGIN"; else cf auth "$CF_USERNAME" "$CF_PASSWORD"; fi; cf target -o "$CF_ORG" -s "$CF_SPACE"; cf push "$MCP_APP_NAME" --docker-image "$MCP_IMAGE" --no-manifest -m "$MCP_MEMORY" -k "$MCP_DISK" -i 1 -u http --endpoint /health -t 240'
```

5. Leave **Start Time** and **End Time** empty.
6. Save the task.
7. Create a schedule for the task.
8. Select **Recurring - Repeat At** and set **Value** to `05:00`.
9. Keep the schedule active and save it.

Schedules run in UTC. If the dashboard asks for SAP cron instead of `repeatAt`,
daily `05:00 UTC` is:

```text
* * * * 5 0 0
```

Field order:

```text
Year Month Day DayOfWeek Hour Minute Second
```

Before relying on the daily schedule, run the task once manually using the
commands in "Manual Refresh on BTP CF".

## Troubleshooting

`cf push` deploys to the wrong org or space:
Check `cf target`. MTA deploys to the currently targeted org and space.

The route is wrong or generated:
Set an explicit route in `mta-overrides.mtaext` and redeploy the MTA. Use
`cf domains` to find the right CF domain.

`/status` returns 404:
Use `/health`. The Streamable HTTP server exposes `/health` and `/mcp`.

Docker deploy fails with image layer or disk quota errors:
Increase `disk-quota` first. Semantic images need `6144M` by default.

The app exits during startup with embeddings enabled:
Increase memory or set `MCP_PRELOAD_EMBEDDINGS=false`. Use FTS-only only if
quota is too tight for semantic search.

Node.js buildpack staging fails after a long upload:
Use Docker image deployment. The current full corpus is too large for the tested
buildpack package path.

`cf run-task` rejects `--memory` or `--disk`:
Use `-m` and `-k`.

The Job Scheduler dashboard rejects the task name:
Use underscores, for example `mcp_sap_docs_refresh`.

The dashboard **Jobs** form asks for an HTTP action:
Use **Tasks** for this setup. Calling `/health` from a job only checks that the
app is alive; it does not refresh the image.

The scheduled task fails with `invalid_grant`:
The deploy identity cannot authenticate non-interactively. A user that works
with `cf login --sso` may still fail with `cf auth`. Use a technical user or CF
UAA client and verify `CF_ORIGIN`, username, password, and space role.

`read -rsp` fails in zsh:
Use the password prompt shown in this guide. In zsh, `read -p` means "read from
coprocess".

The scheduler does not pick up changed `MCP_IMAGE`, memory, or disk settings:
After changing deployer environment variables, run:

```bash
cf restart mcp-sap-docs-deployer
cf stop mcp-sap-docs-deployer
```

The deployer app stays running:
Stop it after staging or environment changes. It is only needed as a task
template.

Private registry image cannot be pulled:
If you use a custom/private registry, make sure the CF foundation can access
your registry and configure the registry credentials required by your platform.
