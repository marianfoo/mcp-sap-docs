# BTP CF Internal Maintainer Notes

This document is for maintainers of this repository. Keep public user guidance in
`docs/BTP-CF-DEPLOYMENT.md`.

## Maintained Image Publishing

The public guide assumes this image exists and stays current:

```text
ghcr.io/marianfoo/mcp-sap-docs:sap-docs
```

Repository automation:

- Workflow: `.github/workflows/publish-sap-docs-ghcr.yml`
- Schedule: daily before the recommended BTP CF refresh window
- Default build: semantic image with embeddings
- Fallback input: `build_embeddings=false` for FTS-only investigation

Manual workflow dispatch is available after the workflow exists on the default
branch.

One-time local bootstrap from a trusted maintainer machine:

```bash
gh auth token | docker login ghcr.io -u marianfoo --password-stdin
BUILD_EMBEDDINGS=true DOCKER_PLATFORM=linux/amd64 TAG=sap-docs \
  bash scripts/btp/build-ghcr-image.sh --push
```

The image can also be built with plain Docker if the helper script is not
available:

```bash
docker build \
  --platform linux/amd64 \
  --build-arg MCP_VARIANT=sap-docs \
  --build-arg BUILD_EMBEDDINGS=true \
  -t ghcr.io/marianfoo/mcp-sap-docs:sap-docs \
  .

docker push ghcr.io/marianfoo/mcp-sap-docs:sap-docs
```

## GHCR Package Visibility

GitHub repository visibility and GitHub Packages visibility are separate. After
the package is first created, confirm the package is public in GitHub Packages.

If the publish workflow fails after a successful Docker build with
`permission_denied: write_package`, check whether the package is linked to this
repository:

```bash
gh api /user/packages/container/mcp-sap-docs \
  --jq '{repository: .repository.full_name, visibility}'
```

If `repository` is `null`, the package was likely created by a local bootstrap
push before GitHub associated it with the repository. Fix the package settings:

1. Open `https://github.com/users/marianfoo/packages/container/package/mcp-sap-docs`.
2. Click **Connect Repository** and choose `mcp-sap-docs`.
3. Open **Package settings**.
4. Enable **Inherit access from source repository (recommended)**.
5. Under **Manage Actions access**, add repository `mcp-sap-docs`.
6. Change its role from **Read** to **Write**.
7. Re-run **Publish SAP Docs GHCR Image** on `main`.

The workflow already requests `packages: write`; the missing piece is package
write access for this repository's `GITHUB_TOKEN`.

Anonymous manifest check:

```bash
TOKEN="$(curl -fsSL 'https://ghcr.io/token?service=ghcr.io&scope=repository:marianfoo/mcp-sap-docs:pull' | python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))')"
curl -fsSI \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json' \
  https://ghcr.io/v2/marianfoo/mcp-sap-docs/manifests/sap-docs
```

Expected result: `HTTP/2 200`.

Do not document this as a user prerequisite. Users should be able to deploy the
maintained public image directly.

## Digest Handling

Image digests are point-in-time identifiers. The digest can change whenever the
image is rebuilt, even if the tag name stays `sap-docs`.

Guidance:

- Use the `sap-docs` tag for daily refreshes.
- Use a digest only for a fixed reproducibility investigation.
- Do not put a fixed digest in the public deployment guide as the recommended
  value.

## Semantic Image Validation

Validation performed on 2026-06-24:

- Image: `ghcr.io/marianfoo/mcp-sap-docs:sap-docs`
- Digest at validation time:
  `sha256:5ce587adda15c654bff82ab4fd7a5f8a9e3ee43715c797629b094d177fe012d9`
- Platform: `linux/amd64`
- Local image size: about `4.76 GB`
- FTS rows: `45,914`
- Embedded documents: `19,869`
- Semantic `docs.sqlite`: `72.1 MB`
- BTP CF limits used: `1024M` memory, `6144M` disk
- Observed BTP CF footprint after startup: about `343M-369M` memory and `4.4G`
  disk
- Manual scheduled-style redeploy duration: about `87` seconds

The digest above is historical validation evidence, not a stable deployment
target.

## MTA Deployment Validation

MTA deployment path validated on 2026-06-24:

- Build command: `mbt build`
- Deploy command:
  `cf deploy mta_archives/mcp-sap-docs-btp-cf_0.3.48.mtar -e .tmp-mta-test.mtaext -f`
- MTA ID: `mcp-sap-docs-btp-cf`
- Module/app created: `mcp-sap-docs-server`
- Test route: `mcp-sap-docs-mta-test.cfapps.us10-001.hana.ondemand.com`
- Docker image: `ghcr.io/marianfoo/mcp-sap-docs:sap-docs`
- App resources: `1024M` memory, `6144M` disk
- Observed footprint: about `328M` memory and `4.4G` disk
- Checks passed: `/health`, MCP `initialize`, `tools/list`, offline `search`,
  and `fetch`
- Cleanup command: `cf undeploy mcp-sap-docs-btp-cf -f`

The test confirms that `mta.yaml` works with the no-source Docker image module
and that route override through an extension descriptor works. The test MTA app
was undeployed after validation so the direct-push scheduled app remains the only
running MCP app in the trial space.

## BTP CF Smoke Test

The public deployment guide documents `/health`. Use this deeper smoke test
internally after changing the Dockerfile, server startup, streamable transport,
or BTP deployment descriptors.

```bash
export ROUTE="https://<route>"

node <<'NODE'
const base = process.env.ROUTE;
const accept = "application/json, text/event-stream";

function parseSse(text) {
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data) continue;
    const parsed = JSON.parse(data);
    if (parsed.result || parsed.error) return parsed;
  }
  throw new Error("No JSON-RPC SSE payload found");
}

async function rpc(method, params, sessionId, id) {
  const response = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}: ${text}`);
  const payload = response.headers.get("content-type")?.includes("text/event-stream")
    ? parseSse(text)
    : JSON.parse(text);
  if (payload.error) throw new Error(`${method}: ${JSON.stringify(payload.error)}`);
  return { payload, sessionId: response.headers.get("mcp-session-id") || sessionId };
}

function parseToolResult(result) {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((item) => item.type === "text")?.text;
  return text ? JSON.parse(text) : null;
}

const init = await rpc("initialize", {
  protocolVersion: "2025-07-09",
  capabilities: {},
  clientInfo: { name: "btp-smoke", version: "1.0" },
}, undefined, 1);

const sessionId = init.sessionId;
const tools = await rpc("tools/list", {}, sessionId, 2);
const toolNames = tools.payload.result.tools.map((tool) => tool.name).sort();
for (const required of ["search", "fetch", "sap_discovery_center_search"]) {
  if (!toolNames.includes(required)) {
    throw new Error(`Missing ${required}; available: ${toolNames.join(", ")}`);
  }
}

const search = await rpc("tools/call", {
  name: "search",
  arguments: {
    query: "SAP Job Scheduling Service Cloud Foundry task",
    k: 5,
    includeOnline: false,
  },
}, sessionId, 3);

const results = parseToolResult(search.payload.result)?.results || [];
if (!results.length) throw new Error("Search returned zero results");

const fetched = await rpc("tools/call", {
  name: "fetch",
  arguments: { id: results[0].id },
}, sessionId, 4);

const doc = parseToolResult(fetched.payload.result);
if (!doc?.text || doc.text.length < 50) throw new Error("Fetch returned no text");

await fetch(`${base}/mcp`, {
  method: "DELETE",
  headers: { accept, "mcp-session-id": sessionId },
}).catch(() => {});

console.log(`OK tools=${toolNames.join(",")} search=${results.length} fetch=${doc.id}`);
NODE
```

Known result from validation:

```text
OK search=5 fetch=/btp-cloud-platform/50-administration-and-ops/operations-for-external-job-scheduling-service-cbeb209
```

## Scheduler Setup Findings

Operational findings from the BTP CF setup:

- Use Job Scheduling Service **Tasks**, not **Jobs**, for the redeploy trigger.
- The scheduler REST API can list the dashboard-created CF task as a job at
  `/scheduler/jobs`; the tested job ID was `7472481`.
- A one-time test schedule was created through
  `POST /scheduler/jobs/{jobId}/schedules` with `time:
  "2026-06-24T09:45:00Z"` to run at `11:45` Europe/Berlin.
- The one-time test schedule fired successfully:
  - CF task id: `6`
  - task name: `jobscheduler-task-4fdf7734-2da5-4539-9885-c6349e22aa2a`
  - start time: `2026-06-24 09:45:00 UTC`
  - result: `SUCCEEDED`
  - target app upload time: `2026-06-24 11:45:08 CEST`
  - target app healthy at `2026-06-24 09:46:32 UTC`
  - post-run checks passed: `/health`, MCP `initialize`, `tools/list`, offline
    `search`, and `fetch`
- The one-time test schedule was deleted after validation; only the daily
  `05:00 UTC` schedule remains active.
- Dashboard CF task names reject hyphens; use `mcp_sap_docs_refresh`.
- `Recurring - Repeat At` with `05:00` creates a daily UTC schedule in the
  tested dashboard.
- SAP cron order is `Year Month Day DayOfWeek Hour Minute Second`; daily
  `05:00 UTC` is `* * * * 5 0 0`.
- `cf run-task` on the tested CF CLI accepts `-m` and `-k`; long
  `--memory`/`--disk` failed.
- A local `cf login --sso` session is not enough for a scheduled CF task. The
  deployer container needs non-interactive `cf auth`.
- For custom SAP Cloud Identity Services platform users, use the origin shown in
  CF org/space member configuration.
- On SAP BTP, `cf create-user` can be blocked; creating the user in IAS and
  assigning the CF space role worked.
- `read -rsp` is not portable to zsh because `-p` means "read from coprocess".
- The deployer app should stay stopped between runs.
- After changing deployer env vars, restart and stop the deployer so task
  templates use the new environment.

## Current Recommended Defaults

Keep these public defaults unless a later validation run proves otherwise:

- semantic image memory: `1024M`
- semantic image disk: `6144M`
- instances: `1`
- `MCP_PRELOAD_EMBEDDINGS=true`
- deployer app memory: `64M`
- deployer app disk: `512M`
- scheduler time: `05:00 UTC`
- upstream image build time: earlier than the BTP CF schedule, currently
  targeted around `01:00 UTC`
