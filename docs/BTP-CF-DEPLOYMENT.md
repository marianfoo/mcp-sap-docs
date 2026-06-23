# SAP BTP Cloud Foundry Deployment

This guide publishes the `sap-docs` variant as a public Streamable HTTP MCP
server on SAP BTP Cloud Foundry.

Current recommendation: publish the `sap-docs` FTS-only image to GHCR, then
deploy that published image to Cloud Foundry with MTA. This keeps expensive work
(submodule clone, FTS build, optional embeddings build) out of CF staging and
fits the current public trial profile.

## Recommended Model

The `sap-docs` profile indexes many documentation repositories and can also
cache the semantic model in `dist/models`. Building that directly inside Cloud
Foundry staging with the Node.js buildpack would make CF clone large submodules,
generate SQLite data, and possibly download model files. That is slow,
resource-sensitive, and failed in the tested package path for the current full
corpus.

The recommended deployment flow is:

1. GitHub Actions, or your workstation, builds the Docker image.
2. The image is published to GHCR.
3. BTP CF pulls and runs the GHCR image.
4. MTA manages app name, route, memory, disk quota, and later service bindings.

Docker is not required on the BTP CF side. CF only needs Docker-image support and
access to the registry. Docker is required only where the image is built or
locally smoke-tested.

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

Semantic embeddings are not required for the MCP server to run.

With embeddings:

- Better natural-language and paraphrase matching.
- Larger image because `docs.sqlite` includes vectors and `dist/models` includes
  `Xenova/all-MiniLM-L6-v2`.
- More startup memory if the model is preloaded.

Without embeddings:

- BM25/FTS search, fetch, and online sources still work.
- Smaller and faster image builds.
- No semantic reranking.

Default BTP image builds are FTS-only. This is the right first deployment mode
for the public CF trial. Build a semantic image only after the FTS-only route is
stable and you have deliberately budgeted the larger image, model dependencies,
and startup/runtime memory.

FTS-only means:

- `scripts/build-index.ts` still builds `dist/data/index.json`.
- `scripts/build-fts.ts` still builds the SQLite BM25/FTS database.
- `scripts/build-embeddings.ts` is skipped.
- The deployed image removes Hugging Face/ONNX runtime dependencies that are
  only needed for semantic query embedding.
- Search remains deterministic keyword/full-text search plus fetch and online
  sources.

Use semantic embeddings when natural-language/paraphrase matching is worth the
larger image and runtime footprint. Use FTS-only when the priority is a small,
predictable CF app that stays inside tight memory and disk quotas.

## Prerequisites

- `cf` CLI logged in and targeted to the destination org/space.
- `mbt` installed for MTA deployment.
- GHCR access for `ghcr.io/marianfoo/mcp-sap-docs`.
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

## Build and Push the GHCR Image

If you already publish `ghcr.io/marianfoo/mcp-sap-docs:sap-docs` from GitHub
Actions, you can skip the local build entirely and go straight to deployment.
Local builds are useful for reproducing the image or testing a candidate tag
before making it the stable `sap-docs` tag.

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

FTS-only build:

```bash
bash scripts/btp/build-ghcr-image.sh --no-embeddings --push
```

`npm run btp:build-image` and `npm run btp:build-image:push` are FTS-only by
default. To build the larger semantic image, use:

```bash
bash scripts/btp/build-ghcr-image.sh --embeddings --push
```

For the FTS-only image, keep `MCP_PRELOAD_EMBEDDINGS=false` in the deployed app.

## Publish from GitHub Actions

The workflow `.github/workflows/publish-sap-docs-ghcr.yml` publishes the same
image to GHCR. It also runs on a daily schedule and publishes an FTS-only image
by default.

Manual run:

1. Open GitHub Actions.
2. Run "Publish SAP Docs GHCR Image".
3. Keep `build_embeddings=false` for the default FTS-only image.
4. Set `build_embeddings=true` only for a full semantic image experiment.

The workflow can take a while because the Dockerfile clones documentation
sources and builds the local search database inside the image.

Scheduled runs refresh the GHCR image, not the running CF app by themselves.
Redeploy the CF app after a scheduled image build if you want BTP to pick up the
new image.

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
  -m 512M \
  -k 4G \
  -i 1 \
  -u http \
  --endpoint /health \
  -t 240
```

What the important flags do:

- `--docker-image`: tells CF to pull an existing image instead of staging source.
- `--docker-username` plus `CF_DOCKER_PASSWORD`: used only for private registries.
- `--no-manifest`: ignores any local manifest so the command is self-contained.
- `-m 512M`: caps runtime memory for the single web instance.
- `-k 4G`: gives the app enough disk for the uncompressed image filesystem.
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

Default deployment values for the FTS-only public trial:

- memory: `512M`
- disk quota: `4096M`
- instances: `1`
- embeddings preload: `false`

Parameter guidance:

| Parameter | Default | Why it matters |
| --- | --- | --- |
| `memory` / `-m` | `512M` | Runtime RAM per app instance. The tested FTS-only app used roughly 100-160 MB after startup, so 512 MB leaves practical headroom. Increase this first only if logs show memory pressure. |
| `disk-quota` / `disk_quota` / `-k` | `4096M` | CF Docker apps must fit the image filesystem layers inside the app disk quota. The tested image failed at 3 GB and ran at about 3.5 GB of 4 GB. |
| `instances` / `-i` | `1` | One instance minimizes quota use for the public trial. Use at least two only when you need availability during platform maintenance or deploys. |
| `MCP_PRELOAD_EMBEDDINGS` | `false` | Must stay false for FTS-only images. Set true only with an image that was built with semantic embeddings. |
| `health-check-type` | `http` | Confirms the app can serve `/health`, not just that the process opened a port. |
| `timeout` / `-t` | `180-240` | Large images can take longer to pull/start. The allowed maximum is foundation-specific. If a higher value is rejected, use the maximum shown by CF. |

Do not optimize only for compressed image size. CF Docker startup is constrained
by the uncompressed image filesystem and app disk quota. CF buildpack staging is
constrained by upload size, staging disk, dependency install/rebuild, droplet
copying, and droplet compression.

If staging or startup fails:

- If Docker deploy fails with an uncompressed image layer quota at `3G`, keep the
  FTS-only image and use `disk-quota: 4096M`.
- If startup runs out of memory, first confirm `MCP_PRELOAD_EMBEDDINGS=false`.
  Increase memory only for a deliberate semantic image test.
- If the Docker image is too slow to build locally, use the GitHub Actions
  workflow so the large build runs off-machine.

Do not run `MCP_VARIANT=sap-docs npm run setup && npm run build` on a small CF
staging container unless you deliberately choose the Node.js buildpack path.

## Node.js Buildpack Package Result

The full `sap-docs` corpus was also tested as a prebuilt Node.js package with
vendored production dependencies and `MCP_PRELOAD_EMBEDDINGS=false`.

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
filesystem.

Downsides of the Node.js buildpack path for this project:

- Large upload/package cycle every deploy instead of a registry pull.
- Buildpack installs Node.js and may rebuild/install dependencies during staging.
- Vendored dependencies reduce network dependency but increase app package size.
- Staging needs temporary disk for the app package, dependencies, droplet copy,
  and compressed droplet.
- The app filesystem is still immutable/ephemeral; it is not a good place to
  refresh documentation in-place.

## Daily Resource Refresh

The right refresh model is immutable image refresh:

1. Rebuild the docs corpus once per day in CI.
2. Publish a new GHCR image tag.
3. Redeploy the CF app so it pulls the refreshed image.

Do not refresh `dist/data/docs.sqlite` or `sources/` inside the running CF app.
Those changes are not reproducible, may disappear on restart/restage, and will
not update all instances consistently.

This PR configures `.github/workflows/publish-sap-docs-ghcr.yml` with a daily
scheduled run at `02:17 UTC`. It publishes:

- stable tag: `ghcr.io/marianfoo/mcp-sap-docs:sap-docs`
- commit tag: `ghcr.io/marianfoo/mcp-sap-docs:sap-docs-<git-sha>`
- dated scheduled tag: `ghcr.io/marianfoo/mcp-sap-docs:sap-docs-YYYYMMDD`

For a controlled rollout, leave the workflow as publish-only and redeploy CF
after reviewing the scheduled build:

```bash
cf push -f manifest-btp-cf-sap-docs.yml
```

For full daily auto-rollout, add a deploy job after the image publish job with
CF credentials stored as GitHub environment secrets. The job should log in to CF
and rerun either the direct manifest push or the MTA deploy:

```bash
cf api "$CF_API"
cf auth "$CF_USERNAME" "$CF_PASSWORD"
cf target -o "$CF_ORG" -s "$CF_SPACE"
cf push -f manifest-btp-cf-sap-docs.yml
```

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
