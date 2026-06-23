# SAP BTP Cloud Foundry Deployment

This guide publishes the `sap-docs` variant as a public Streamable HTTP MCP
server on SAP BTP Cloud Foundry.

Current recommendation: build the search corpus into an FTS-only Docker image,
publish it to GHCR, then deploy that image to Cloud Foundry with MTA. This keeps
expensive work (submodule clone, FTS build, optional embeddings build) out of CF
staging and fits the current public trial profile.

## Why Docker First

The `sap-docs` profile indexes many documentation repositories and can also
cache the semantic model in `dist/models`. Building that directly with the
Node.js buildpack would make Cloud Foundry staging clone large submodules,
generate SQLite data, and download model files. That is possible, but slow and
resource-sensitive.

Docker gives a cleaner operating model:

- CI or a local machine builds the complete image once.
- CF only pulls and runs the image.
- MTA manages the app, route, memory, disk quota, and later service bindings.
- The same image can be smoke-tested locally before deployment.

Use the Node.js buildpack only if the platform cannot pull container images or
your compliance rules require CF staging from source. With the current full
`sap-docs` corpus, Node.js buildpack package deploys are not recommended unless
the source payload is pruned further; staging needs extra disk while copying and
compressing the droplet.

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

## Prerequisites

- `cf` CLI logged in and targeted to the destination org/space.
- `mbt` installed for MTA deployment.
- Docker installed for local builds.
- GHCR access for `ghcr.io/marianfoo/mcp-sap-docs`.
- If the GHCR package is public, CF can pull it without credentials.

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
image to GHCR.

Manual run:

1. Open GitHub Actions.
2. Run "Publish SAP Docs GHCR Image".
3. Keep `build_embeddings=false` for the default FTS-only image.
4. Set `build_embeddings=true` only for a full semantic image experiment.

The workflow can take a while because the Dockerfile clones documentation
sources and builds the local search database inside the image.

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

For a quick smoke test without MTA:

```bash
cf push -f manifest-btp-cf-sap-docs.yml
```

This uses the same GHCR image and public route model. It does not manage the
deployment as an MTA, so prefer MTA once the image and quotas are confirmed.

For a one-off Docker image test with a temporary app name:

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

Default deployment values:

- memory: `512M`
- disk quota: `4096M`
- instances: `1`
- embeddings preload: `false`

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

Observed outcome:

- `512M` memory was enough for runtime, but staging did not complete.
- `3G` and `4G` disk failed while copying the compiled droplet.
- `5G` disk failed while compressing the droplet.
- The buildpack accepted vendored `node_modules`, but the app package plus
  buildpack dependencies plus droplet copy/compression exceeded staging disk.

Use Docker/GHCR for the current corpus. Revisit Node.js buildpack only after
pruning large fetch sources such as OpenUI5 test payloads or splitting the
runtime so source fetches are backed by object storage instead of the CF app
filesystem.
