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
- Access to the maintained GHCR image `ghcr.io/marianfoo/mcp-sap-docs:sap-docs`.
- If the GHCR package is public, CF can pull it without credentials.
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

Build and push your own image only when you intentionally want control over the
image contents, want to test a branch before release, or run a fork.

Log in to GHCR:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u marianfoo --password-stdin
```

Build locally:

```bash
npm run btp:build-image
```

Build and push:

```bash
npm run btp:build-image:push
```

The script tags the image as:

- `ghcr.io/marianfoo/mcp-sap-docs:sap-docs`
- `ghcr.io/marianfoo/mcp-sap-docs:sap-docs-<git-sha>`

FTS-only fallback build:

```bash
bash scripts/btp/build-ghcr-image.sh --no-embeddings --push
```

`npm run btp:build-image` and `npm run btp:build-image:push` build the semantic
image by default. For an FTS-only image, pass `--no-embeddings` and keep
`MCP_PRELOAD_EMBEDDINGS=false` in the deployed app.

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

Scheduled runs refresh the GHCR image. The separate BTP CF deploy workflow runs
later and updates the CF app to pull the refreshed image.

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

For a one-off test with a temporary app name and a private GHCR image:

```bash
CF_DOCKER_PASSWORD="$GHCR_TOKEN" cf push mcp-sap-docs-docker-test \
  --docker-image ghcr.io/marianfoo/mcp-sap-docs:sap-docs \
  --docker-username marianfoo \
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
- `--docker-username` plus `CF_DOCKER_PASSWORD`: used only for private registries.
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

1. Rebuild the docs corpus once per day in CI.
2. Publish a new GHCR image tag.
3. Redeploy the CF app so it pulls the refreshed image.

Do not refresh `dist/data/docs.sqlite` or `sources/` inside the running CF app.
Those changes are not reproducible, may disappear on restart/restage, and will
not update all instances consistently.

This PR configures `.github/workflows/publish-sap-docs-ghcr.yml` with a daily
scheduled run at `01:00 UTC`. It publishes:

- stable tag: `ghcr.io/marianfoo/mcp-sap-docs:sap-docs`
- commit tag: `ghcr.io/marianfoo/mcp-sap-docs:sap-docs-<git-sha>`
- dated scheduled tag: `ghcr.io/marianfoo/mcp-sap-docs:sap-docs-YYYYMMDD`

This PR also adds `.github/workflows/deploy-btp-cf-sap-docs.yml` with a daily
scheduled run at `05:00 UTC`. The four-hour gap gives the corpus/image refresh
time to finish before CF is updated.

The BTP CF deploy workflow requires these GitHub environment secrets in the
`btp-cf` environment:

- `CF_API`
- `CF_USERNAME`
- `CF_PASSWORD`
- `CF_ORG`
- `CF_SPACE`

It installs the official CF CLI, logs in, targets the configured org/space, runs:

```bash
cf push -f manifest-btp-cf-sap-docs.yml
```

and then smoke-tests `/health`.

This schedule is reasonable: `01:00 UTC` refreshes the source corpus when GitHub
Actions is typically quieter, and `05:00 UTC` updates BTP CF after the image has
had time to build and publish. If the image build takes longer than four hours,
the 05:00 deployment will pull the previous stable tag; check the GHCR workflow
duration and adjust the gap if needed.

Use MTA deployment instead of direct `cf push` when route ownership, service
bindings, and later XSUAA protection should be managed declaratively:

```bash
mbt build
cf deploy mta_archives/mcp-sap-docs-btp-cf_*.mtar -e mta-overrides.mtaext
```

SAP Job Scheduling Service is useful when a BTP-native scheduler should call an
admin endpoint or run a finite CF task. For this static corpus image, it should
trigger CI/redeploy rather than mutate the running app filesystem. SAP describes
the service as supporting recurring jobs and Cloud Foundry tasks; Cloud Foundry
tasks run in their own short-lived containers and are destroyed after completion.

### BTP-Native Refresh Trigger

For a user who only operates BTP CF, the refresh trigger should live in BTP:

1. The project-maintained GHCR workflow publishes a refreshed
   `ghcr.io/marianfoo/mcp-sap-docs:sap-docs` image.
2. A SAP Job Scheduling Service schedule in the user's CF space runs at
   `05:00 UTC`.
3. That schedule triggers a small deployer app or Cloud Foundry task.
4. The deployer runs `cf push -f manifest-btp-cf-sap-docs.yml`, or the
   equivalent Cloud Controller API calls.
5. CF pulls the current GHCR image and replaces the app instances.

This gives the user a BTP-side refresh button/schedule without requiring them to
publish their own Docker image.

Recommended BTP implementation:

- Create a SAP Job Scheduling Service instance, for example:

  ```bash
  cf create-service jobscheduler free mcp-sap-docs-scheduler
  ```

- Bind it to a small deployer app in the same space.
- The deployer app contains only the CF CLI, `manifest-btp-cf-sap-docs.yml`, and
  a script that targets the org/space and runs `cf push`.
- Configure a recurring Job Scheduling Service schedule with cron `0 5 * * *`.
- Keep the deployer app stopped if possible and let the scheduler run it as a CF
  task. This avoids keeping a second web process running just to redeploy the
  MCP server.

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
