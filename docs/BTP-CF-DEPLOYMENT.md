# SAP BTP Cloud Foundry Deployment

This guide publishes the `sap-docs` variant as a public Streamable HTTP MCP
server on SAP BTP Cloud Foundry.

Current recommendation: deploy the project-maintained GHCR image
`ghcr.io/marianfoo/mcp-sap-docs:sap-docs` to Cloud Foundry with MTA. The release
and scheduled GitHub workflows build this image with the offline corpus included,
so BTP CF only has to pull and run it.

## Recommended Model

The `sap-docs` profile indexes many documentation repositories and can also
cache the semantic model in `dist/models`. Building that directly inside Cloud
Foundry staging with the Node.js buildpack would make CF clone large submodules,
generate SQLite data, and possibly download model files. That is slow,
resource-sensitive, and failed in the tested package path for the current full
corpus.

The recommended deployment flow for users is:

1. The project release/scheduled workflow publishes
   `ghcr.io/marianfoo/mcp-sap-docs:sap-docs`.
2. BTP CF pulls and runs that GHCR image.
3. MTA manages app name, route, memory, disk quota, and later service bindings.

Docker is not required on the BTP CF side. CF only needs Docker-image support and
access to the registry. Local/self-published images are useful only when you
need full control over the image build, a private fork, or a reproducibility
test before the project image is published.

Use the Node.js buildpack only if the platform cannot pull container images or
your compliance rules require CF staging from source. With the current full
`sap-docs` corpus, Node.js buildpack package deploys are not recommended unless
the source payload is pruned further; staging needs extra disk while copying and
compressing the droplet.

Reference docs:

- [Cloud Foundry: deploying an app based on a Docker image](https://docs.cloudfoundry.org/devguide/deploy-apps/push-docker.html)
- [SAP BTP: deploy Docker images in the Cloud Foundry environment](https://help.sap.com/docs/btp/sap-business-technology-platform/deploy-docker-images-in-cloud-foundry-environment)
- [Cloud Foundry: deploying large apps](https://docs.cloudfoundry.org/devguide/deploy-apps/large-app-deploy.html)
- [SAP Job Scheduling Service](https://help.sap.com/doc/234ab5b017b14bfa9d96152c5d9335e7/Cloud/en-US/jobscheduler.pdf)
- [Cloud Foundry: running tasks in your apps](https://docs.cloudfoundry.org/devguide/using-tasks.html)

## Semantic Embeddings

Semantic embeddings are not required for the MCP server to run, but they are the
recommended quality profile for `sap-docs`.

With embeddings:

- Better natural-language and paraphrase matching.
- Larger image because `docs.sqlite` includes vectors and `dist/models` includes
  `Xenova/all-MiniLM-L6-v2`.
- More startup memory if the model is preloaded.

Without embeddings:

- BM25/FTS search, fetch, and online sources still work.
- Smaller and faster image builds.
- No semantic reranking.

Default BTP image builds include semantic embeddings. This gives better search
quality for natural-language, synonym, and paraphrase-heavy queries. It costs
more disk and memory than FTS-only, so the deployment descriptors use larger
defaults than the minimal FTS-only smoke test.

FTS-only means:

- `scripts/build-index.ts` still builds `dist/data/index.json`.
- `scripts/build-fts.ts` still builds the SQLite BM25/FTS database.
- `scripts/build-embeddings.ts` is skipped.
- The deployed image removes Hugging Face/ONNX runtime dependencies that are
  only needed for semantic query embedding.
- Search remains deterministic keyword/full-text search plus fetch and online
  sources.

Actual effect of enabling embeddings:

- Build time increases because `scripts/build-embeddings.ts` embeds the corpus.
- `docs.sqlite` grows because it stores vector rows in the `embeddings` table.
- The runtime image keeps Hugging Face/ONNX dependencies and the cached model.
- `MCP_PRELOAD_EMBEDDINGS=true` loads the model at startup, improving first-query
  latency but increasing startup memory.
- If preload is false and the image contains embeddings, semantic search can
  still lazy-load the model on the first semantic query; the first query is just
  slower.

Recommended semantic starting values:

- memory: `1024M`
- disk quota: `6144M`
- instances: `1`
- `MCP_PRELOAD_EMBEDDINGS=true`

FTS-only remains the fallback for constrained quotas or debugging. The FTS-only
Docker path was live-tested with `512M` memory and `4096M` disk.

## Prerequisites

- `cf` CLI logged in and targeted to the destination org/space.
- `mbt` installed for MTA deployment.
- Access to the maintained public GHCR image
  `ghcr.io/marianfoo/mcp-sap-docs:sap-docs`.
- Docker installed only if you build or smoke-test the image locally. If GitHub
  Actions publishes the image, your deploy machine only needs `cf` and `mbt`.

Current local target checked during preparation:

```bash
cf target
```

Expected shape:

```text
API endpoint: https://api.cf.us10-001.hana.ondemand.com
org:          Marian_Zeis_joule2-7lrbs13d
space:        dev
```

## GHCR Image

Most users should not publish their own image. Use the maintained image from the
release/scheduled workflow:

```text
ghcr.io/marianfoo/mcp-sap-docs:sap-docs
```

Build your own image only when you intentionally want control over the image
contents, want to test a branch before release, or run a fork. This is not part
of the normal user deployment path, and users of the maintained image should
skip local image publishing entirely.

Build locally:

```bash
npm run btp:build-image
```

The build script tags the image as:

- `ghcr.io/marianfoo/mcp-sap-docs:sap-docs`
- `ghcr.io/marianfoo/mcp-sap-docs:sap-docs-<git-sha>`

FTS-only fallback build:

```bash
bash scripts/btp/build-ghcr-image.sh --no-embeddings
```

`npm run btp:build-image` builds the semantic image by default. For an FTS-only
image, pass `--no-embeddings` and keep `MCP_PRELOAD_EMBEDDINGS=false` in the
deployed app.

## Publish from GitHub Actions

The workflow `.github/workflows/publish-sap-docs-ghcr.yml` publishes the
maintained image to GHCR. It also runs on a daily schedule and publishes a
semantic image by default.

Manual run:

1. Open GitHub Actions.
2. Run "Publish SAP Docs GHCR Image".
3. Keep `build_embeddings=true` for the recommended semantic image.
4. Set `build_embeddings=false` only for an FTS-only fallback image.

The workflow can take a while because the Dockerfile clones documentation
sources and builds the local search database inside the image.

Scheduled runs refresh the GHCR image. User-side BTP refresh should be triggered
later by SAP Job Scheduling Service; see "Daily Resource Refresh".

## Deploy with MTA

Copy the extension template and choose a route:

```bash
cp mta-overrides.mtaext.example mta-overrides.mtaext
$EDITOR mta-overrides.mtaext
```

Deploy:

```bash
npm run btp:deploy:mta
```

Manual equivalent:

```bash
mbt build
cf deploy mta_archives/mcp-sap-docs-btp-cf_*.mtar -e mta-overrides.mtaext
```

If you do not create `mta-overrides.mtaext`, the app still deploys, but CF/MTA
will assign a generated route.

## Fast Trial with `cf push`

Use this when you want to prove that the GHCR image starts on CF before creating
or updating an MTA deployment. It creates a normal CF app directly from the
image. It does not create services, XSUAA, destinations, or an MTA deployment
record.

If your manifest points at the public or already accessible GHCR image:

```bash
cf push -f manifest-btp-cf-sap-docs.yml
```

This uses the same GHCR image and public route model. It does not manage the
deployment as an MTA, so prefer MTA once the image and quotas are confirmed.

For a one-off test with a temporary app name:

```bash
cf push mcp-sap-docs-docker-test \
  --docker-image ghcr.io/marianfoo/mcp-sap-docs:sap-docs \
  --no-manifest \
  -m 1024M \
  -k 6G \
  -i 1 \
  -u http \
  --endpoint /health \
  -t 240
```

What the important flags do:

- `--docker-image`: tells CF to pull an existing image instead of staging source.
- `--no-manifest`: ignores any local manifest so the command is self-contained.
- `-m 1024M`: caps runtime memory for the single semantic-search web instance.
- `-k 6G`: gives the app enough disk for the uncompressed semantic image
  filesystem.
- `-i 1`: keeps the trial to one instance.
- `-u http --endpoint /health`: uses the app health endpoint instead of a plain
  port check.
- `-t 240`: gives large-image startup more time if the foundation allows it.

Useful cleanup commands:

```bash
cf app mcp-sap-docs-docker-test
cf logs mcp-sap-docs-docker-test --recent
cf delete mcp-sap-docs-docker-test -f -r
```

## Verify

Get the route:

```bash
cf app mcp-sap-docs-server
```

For direct manifest deploys, the app name is `mcp-sap-docs`.

Health:

```bash
curl -sS https://<route>/health | jq .
```

MCP initialize:

```bash
curl -sS https://<route>/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-07-09","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}' | jq .
```

Logs:

```bash
cf logs mcp-sap-docs-server --recent
```

## Public-First Security Notes

This first deployment is intentionally public and unauthenticated.

Operational guardrails for that phase:

- It exposes documentation/search only, not SAP system access.
- It should not bind XSUAA or Destination services yet.
- Keep route names deployment-specific.
- Watch `cf logs` for expensive/repeated requests.
- Do not set secrets in `manifest-btp-cf-sap-docs.yml`, `mta.yaml`, or
  `mta-overrides.mtaext`.

Later protection should add XSUAA and MCP OAuth metadata as a separate change.

## Resource Tuning

Default deployment values for the recommended semantic profile:

- memory: `1024M`
- disk quota: `6144M`
- instances: `1`
- embeddings preload: `true`

Parameter guidance:

| Parameter | Default | Why it matters |
| --- | --- | --- |
| `memory` / `-m` | `1024M` | Runtime RAM per app instance. Embedding preload keeps the model resident so search is fast from the first request. Use `512M` only for FTS-only fallback. |
| `disk-quota` / `disk_quota` / `-k` | `6144M` | CF Docker apps must fit the uncompressed image filesystem inside the app disk quota. FTS-only failed at 3 GB and ran at about 3.5 GB of 4 GB; semantic images need additional headroom for vectors, model cache, and ONNX/Hugging Face runtime dependencies. |
| `instances` / `-i` | `1` | One instance minimizes quota use for the public trial. Use at least two only when you need availability during platform maintenance or deploys. |
| `MCP_PRELOAD_EMBEDDINGS` | `true` | Loads the embedding model at startup for better first-query latency. Set false for FTS-only fallback or when you deliberately prefer lazy first-query model loading. |
| `health-check-type` | `http` | Confirms the app can serve `/health`, not just that the process opened a port. |
| `timeout` / `-t` | `180-240` | Large images can take longer to pull/start. The allowed maximum is foundation-specific. If a higher value is rejected, use the maximum shown by CF. |

Do not optimize only for compressed image size. CF Docker startup is constrained
by the uncompressed image filesystem and app disk quota. CF buildpack staging is
constrained by upload size, staging disk, dependency install/rebuild, droplet
copying, and droplet compression.

If staging or startup fails:

- If Docker deploy fails with an uncompressed image layer quota, increase
  `disk-quota` first.
- If startup runs out of memory with embeddings enabled, increase memory or set
  `MCP_PRELOAD_EMBEDDINGS=false` to defer model loading until the first semantic
  query.
- If quota is tight, rebuild/use an FTS-only image and set
  `MCP_PRELOAD_EMBEDDINGS=false`, `memory: 512M`, and `disk-quota: 4096M`.
- If the Docker image is too slow to build locally, use the GitHub Actions
  workflow so the large build runs off-machine.

Do not run `MCP_VARIANT=sap-docs npm run setup && npm run build` on a small CF
staging container unless you deliberately choose the Node.js buildpack path.

## Node.js Buildpack Package Result

The full `sap-docs` corpus was also tested as a prebuilt FTS-only Node.js
package with vendored production dependencies and
`MCP_PRELOAD_EMBEDDINGS=false`.

This was a real no-Docker CF runtime test: CF used the `nodejs_buildpack`, not
the Docker lifecycle. The package content was prepared from the already built
runtime filesystem to avoid asking CF to clone submodules and build the index
during staging. That is the most favorable buildpack version of this approach;
a pure source push would do more work inside CF staging, not less.

Observed outcome:

- `512M` memory was enough for runtime, but staging did not complete.
- `3G` and `4G` disk failed while copying the compiled droplet.
- `5G` disk failed while compressing the droplet.
- The buildpack accepted vendored `node_modules`, but the app package plus
  buildpack dependencies plus droplet copy/compression exceeded staging disk.
- Each attempt spent roughly 10-15 minutes in upload/package/staging before
  failing.

Use Docker/GHCR for the current corpus. Revisit Node.js buildpack only after
pruning large fetch sources such as OpenUI5 test payloads or splitting the
runtime so source fetches are backed by object storage instead of the CF app
filesystem. A semantic Node.js buildpack package would be larger than the tested
FTS-only package because it would also carry embeddings, model cache, and
semantic runtime dependencies.

Downsides of the Node.js buildpack path for this project:

- Large upload/package cycle every deploy instead of a registry pull.
- Buildpack installs Node.js and may rebuild/install dependencies during staging.
- Vendored dependencies reduce network dependency but increase app package size.
- Staging needs temporary disk for the app package, dependencies, droplet copy,
  and compressed droplet.
- The app filesystem is still immutable/ephemeral; it is not a good place to
  refresh documentation in-place.

## Daily Resource Refresh

The right refresh model for this project is immutable image refresh:

1. The maintained `ghcr.io/marianfoo/mcp-sap-docs:sap-docs` image is refreshed
   upstream.
2. SAP Job Scheduling Service in the user's BTP CF space triggers a redeploy.
3. CF pulls the current image and replaces the app instances.

Do not refresh `dist/data/docs.sqlite` or `sources/` inside the running CF app.
Those changes are not reproducible, may disappear on restart/restage, and will
not update all instances consistently.

For a user who only operates BTP CF, the refresh trigger should live in BTP and
should be SAP Job Scheduling Service:

1. The maintained image publishing process publishes a refreshed
   `ghcr.io/marianfoo/mcp-sap-docs:sap-docs` image.
2. A SAP Job Scheduling Service schedule in the user's CF space runs at
   `05:00 UTC`.
3. That schedule triggers a small deployer app or Cloud Foundry task.
4. The deployer runs `cf push -f manifest-btp-cf-sap-docs.yml`, or the
   equivalent Cloud Controller API calls.
5. CF pulls the current GHCR image and replaces the app instances.

This gives the user a BTP-side refresh button/schedule without requiring them to
publish their own Docker image.

### Recommended Job Scheduler Setup

Use a separate deployer target instead of adding a refresh endpoint to the MCP
server. The deployer target can be a tiny no-route CF app whose staged droplet is
used only for a scheduled CF task.

The shape is:

```text
SAP Job Scheduling Service
  -> scheduled Cloud Foundry task at 05:00 UTC
  -> mcp-sap-docs-deployer task container
  -> cf push mcp-sap-docs with the public GHCR image
  -> mcp-sap-docs pulls ghcr.io/marianfoo/mcp-sap-docs:sap-docs
```

Why this is preferred:

- The public MCP server stays immutable and only serves MCP requests.
- The refresh action is a short-lived CF task, so no second web process has to
  stay running.
- The task runs in the user's BTP CF space and can be monitored in the Job
  Scheduling Service dashboard.
- CF replaces the app from the maintained GHCR image instead of mutating
  `sources/` or `docs.sqlite` inside one running container.

Prerequisites:

- `jobscheduler` entitlement in the subaccount and quota assigned to the CF
  space.
- A Job Scheduling Service service plan. The `free` plan is enough for one daily
  refresh; it supports up to 15 schedules with a minimum frequency of one hour.
- A platform user that can authenticate to the CF API. For production, use a
  dedicated technical user. For a trial/dev setup, you can use your own platform
  user and replace it with a technical user later.
- The platform user must exist in SAP ID service or in the trusted SAP Cloud
  Identity Services tenant first; BTP/CF only assigns roles to that identity. On
  SAP BTP, creating an internal CF user with `cf create-user` may be blocked.
- The platform user should have the `SpaceDeveloper` role in the target CF
  space. Do not grant broader org roles unless your deployment process really
  needs them.
- A small deployer app that contains the CF CLI. The easiest option is the
  public `cloudfoundry/cli` image. Do not push the full repository as the
  deployer app.

Create the scheduler service instance:

```bash
cf create-service jobscheduler free mcp-sap-docs-scheduler
```

Create and stage the deployer app in the same org/space as the MCP app. The
deployer has no route and a harmless start command that lets Cloud Foundry stage
a droplet once. After staging succeeds, stop the app and run only scheduled
tasks from it.

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

Recommended deployer app limits:

- memory: `64M`
- disk quota: `512M`
- routes: none
- running instances: `0` after initial staging

Set the target app parameters as deployer environment variables:

```bash
cf set-env mcp-sap-docs-deployer CF_API "https://api.cf.<region>.hana.ondemand.com"
cf set-env mcp-sap-docs-deployer CF_ORG "<org>"
cf set-env mcp-sap-docs-deployer CF_SPACE "<space>"
cf set-env mcp-sap-docs-deployer MCP_APP_NAME "mcp-sap-docs"
cf set-env mcp-sap-docs-deployer MCP_IMAGE "ghcr.io/marianfoo/mcp-sap-docs:sap-docs"
cf set-env mcp-sap-docs-deployer MCP_MEMORY "1024M"
cf set-env mcp-sap-docs-deployer MCP_DISK "6144M"
```

Set CF deploy credentials as environment variables too. A technical user is
recommended, but a personal platform user is acceptable for a trial/dev setup:

```bash
cf set-env mcp-sap-docs-deployer CF_USERNAME "<platform-user>"
cf set-env mcp-sap-docs-deployer CF_ORIGIN "<origin>"
```

Set the password without echoing it to the terminal. This works in zsh and bash:

```bash
printf "CF password: "
stty -echo
IFS= read -r CF_PASSWORD
stty echo
printf "\n"
cf set-env mcp-sap-docs-deployer CF_PASSWORD "$CF_PASSWORD"
unset CF_PASSWORD
```

Do not use `read -rsp` in zsh. In zsh, `-p` means "read from coprocess", so the
command fails before setting the password variable.

For SAP ID service users, the origin is usually `sap.ids`. For a custom SAP
Cloud Identity Services trust, use the origin shown in **Cloud Foundry -> Org
Members** or **Space Members** in the BTP cockpit.

Assign the platform user to the target space:

```bash
cf set-space-role "<platform-user>" "<org>" "<space>" SpaceDeveloper --origin "<origin>"
```

If you use a personal platform user for the first setup, rotate the password or
replace the deployer credentials with a dedicated technical user before using
the schedule in a shared or production space.

No GHCR credential is needed because the maintained image is public.

Bind the scheduler service to the deployer app:

```bash
cf bind-service mcp-sap-docs-deployer mcp-sap-docs-scheduler
cf restart mcp-sap-docs-deployer
cf stop mcp-sap-docs-deployer
```

Use this one-line task action in the Job Scheduling Service dashboard:

```bash
sh -lc 'set -euo pipefail; cf api "$CF_API"; if [ -n "${CF_ORIGIN:-}" ]; then cf auth "$CF_USERNAME" "$CF_PASSWORD" --origin "$CF_ORIGIN"; else cf auth "$CF_USERNAME" "$CF_PASSWORD"; fi; cf target -o "$CF_ORG" -s "$CF_SPACE"; cf push "$MCP_APP_NAME" --docker-image "$MCP_IMAGE" --no-manifest -m "$MCP_MEMORY" -k "$MCP_DISK" -i 1 -u http --endpoint /health -t 240'
```

The task action should not run `npm run setup`, `npm run build`, or
`npm run build:embeddings`. The refreshed corpus is delivered through the public
GHCR image that was built upstream.

### Dashboard Steps

Open the dashboard from the service instance:

```bash
cf service mcp-sap-docs-scheduler
```

Copy the `dashboard url` into a browser. In the dashboard:

1. Choose **Tasks**, not **Jobs**.
2. Click **Create Task**.
3. Set **Name** to `mcp-sap-docs-refresh`.
4. Set **Application** to `mcp-sap-docs-deployer`.
5. Paste the one-line task action from the previous section into **Action**.
6. Leave **Start Time** and **End Time** empty for an always-available daily
   task.
7. Keep **Activate Job** enabled and save the task.
8. Open the task row's schedule action.
9. Create a recurring schedule for `05:00 UTC`.
10. Activate the schedule.

If the dashboard exposes an **Options (JSON)** field for the task schedule, set
the task memory explicitly:

```json
{"memory_in_mb": 64}
```

SAP Job Scheduling Service uses its own SAP cron format and runs schedules in
UTC. It is not Linux cron. For daily `05:00 UTC`, use this SAP cron expression
when the dashboard asks for a cron value:

```text
* * * * 5 0 0
```

The field order is:

```text
Year Month Day DayOfWeek Hour Minute Second
```

If the dashboard offers `repeatAt`, using `05:00` is easier and avoids cron
format mistakes.

Do not use **Jobs -> Create Job** for this setup. That form is for HTTP action
endpoints. It is only correct if you intentionally build a protected deployer
HTTP endpoint such as `POST /refresh`. Calling the MCP server `/health` endpoint
from a job only proves the app is alive; it does not pull a new image or refresh
the corpus.

### Why Run A Manual Task First?

The manual task is not a technical requirement of Job Scheduling Service. It is
a preflight check before handing the refresh to an unattended daily schedule.

Run it once to catch these mistakes immediately:

- the platform user cannot authenticate to CF
- the platform user cannot push the target app
- the target app name, org, space, or image tag is wrong
- the app quota is too small for the image pull/startup
- the task command has a quoting or dashboard copy/paste issue

If the manual run succeeds, activate the daily schedule. If it fails, fix the
task before it starts failing unattended at `05:00 UTC`.

Use the same action command as the dashboard task:

```bash
REFRESH_COMMAND='sh -lc '\''set -euo pipefail; cf api "$CF_API"; if [ -n "${CF_ORIGIN:-}" ]; then cf auth "$CF_USERNAME" "$CF_PASSWORD" --origin "$CF_ORIGIN"; else cf auth "$CF_USERNAME" "$CF_PASSWORD"; fi; cf target -o "$CF_ORG" -s "$CF_SPACE"; cf push "$MCP_APP_NAME" --docker-image "$MCP_IMAGE" --no-manifest -m "$MCP_MEMORY" -k "$MCP_DISK" -i 1 -u http --endpoint /health -t 240'\'''

cf run-task mcp-sap-docs-deployer \
  --name refresh-mcp-sap-docs \
  -m 64M \
  -k 512M \
  --command "$REFRESH_COMMAND" \
  --wait
```

Monitor the task through CF logs and the Job Scheduling Service dashboard:

```bash
cf tasks mcp-sap-docs-deployer
cf logs mcp-sap-docs-deployer --recent
cf app mcp-sap-docs
```

The task is successful only when `cf push` completes and the MCP app is healthy
after the image pull/startup cycle.

Use MTA deployment instead of direct `cf push` when route ownership, service
bindings, and later XSUAA protection should be managed declaratively:

```bash
mbt build
cf deploy mta_archives/mcp-sap-docs-btp-cf_*.mtar -e mta-overrides.mtaext
```

SAP Job Scheduling Service supports recurring jobs and Cloud Foundry tasks. CF
tasks run in short-lived containers and are destroyed after completion, which is
the right shape for a redeploy trigger.

Do not schedule the MCP server itself to run `git pull`, `npm run build`, or
`npm run build:embeddings` inside the running web container. That would update
only the current instance filesystem, is lost on restart/restage, does not update
all instances consistently, and competes with serving MCP requests.

Alternative BTP-only architecture:

- A scheduled CF task rebuilds the corpus and writes `sources/` plus
  `docs.sqlite` to persistent storage, such as object storage.
- The MCP server reads the active corpus from that external storage.

That model would make refresh fully BTP-owned, but it requires new application
support for external corpus storage and atomic index switching. It is not the
current implementation.
