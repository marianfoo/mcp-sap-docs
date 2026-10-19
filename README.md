# MCP SAP Docs (Upstream)

An MCP server that gives AI assistants (Claude, Cursor, ChatGPT, etc.) access to SAP documentation through a unified search and fetch interface. It combines local full-text search and optional semantic ranking over git-cloned SAP docs with optional live queries to SAP Help, SAP Community, and Software Heroes — all exposed as MCP tools.

## Install

[![Add to Werkbank][werkbank-badge]][werkbank-install]

Or add it to any MCP client that supports streamable HTTP:

```json
{
  "mcpServers": {
    "sap-docs": {
      "type": "http",
      "url": "https://mcp-sap-docs.marianzeis.de/mcp"
    }
  }
}
```

No API key or login required — the server is public and read-only.

## Public Hosted Endpoint

> **Ready to use — no setup required**
>
> | Variant | URL |
> |---------|-----|
> | SAP Docs | `http://mcp-sap-docs.marianzeis.de/mcp` |
> | ABAP | `https://mcp-abap.marianzeis.de/mcp` |

## Variants

`mcp-sap-docs` is the upstream repository for two MCP server variants that share one codebase and differ by configuration (`MCP_VARIANT` / `.mcp-variant`):

| Variant | Scope | Extra tools |
|---------|-------|-------------|
| `sap-docs` | Broad SAP docs: UI5, CAP, Cloud SDK, ABAP, BTP, AI, Terraform | Discovery Center tools |
| `abap` | ABAP-focused: ABAP keyword docs, RAP, cheat sheets, style guides | `abap_lint` |

## Documentation Sources

### Offline sources (local index, always available)

| Source | Description |
|--------|-------------|
| `abap-docs-standard` | Official ABAP Keyword Documentation — on-premise / full syntax |
| `abap-docs-cloud` | Official ABAP Keyword Documentation — ABAP Cloud / BTP (restricted syntax) |
| `abap-cheat-sheets` | Practical ABAP/RAP code snippets and examples |
| `abap-fiori-showcase` | Annotation-driven RAP + OData V4 + Fiori Elements feature showcase |
| `abap-platform-rap-opensap` | openSAP "Building Apps with RAP" course samples |
| `cloud-abap-rap` | ABAP Cloud + RAP example projects |
| `abap-platform-reuse-services` | RAP reuse services examples (number ranges, mail, Adobe Forms, …) |
| `sap-styleguides` | SAP Clean ABAP Style Guide and best practices |
| `dsag-abap-leitfaden` | DSAG ABAP Leitfaden (German) development guidelines |
| `btp-cloud-platform` | SAP BTP concepts, development, security, administration |
| `sap-artificial-intelligence` | SAP AI Core and SAP AI Launchpad documentation |
| `ui5` | SAPUI5 / OpenUI5 framework documentation |
| `cap` | SAP Cloud Application Programming Model (CAP) documentation |
| `cloud-sdk` | SAP Cloud SDK documentation |
| `terraform-provider-btp` | SAP Terraform Provider for BTP — resources and data sources |
| `architecture-center` | SAP Architecture Center reference architectures and guidance |
| `wdi5` | wdi5 (WebdriverIO + UI5) testing framework documentation |

### Additional SAP Docs sources

The `sap-docs` profile also indexes the following official documentation. These sources use the existing Markdown/MDX pipeline and link to their upstream files.

| Source IDs | Coverage |
|------------|----------|
| `btp-connectivity` | Destinations, Cloud Connector, principal propagation, HTTP/RFC |
| `cloud-sdk-python`, `cloud-sdk-ai-python` | Python BTP and AI SDK documentation and examples |
| `odata-vocabularies` | OData annotation terms and types; experimental labels are retained |
| `btp-job-scheduling-service`, `btp-cloud-logging` | Application jobs and observability |
| `btp-cloud-identity-services`, `btp-cloud-identity-integration` | Identity Authentication, Identity Provisioning, and system integration |
| `btp-integration-suite`, `btp-event-mesh` | Consolidated Integrations and APIs guide, plus Event Mesh |
| `btp-business-application-studio` | Dev spaces, development, and troubleshooting |
| `btp-continuous-integration-and-delivery`, `btp-cloud-transport-management` | Managed pipelines and cloud transports |

Integration Suite indexes `docs/ISuite_Integrations_APIs` and `docs/ISuite_Event_Mesh`. Parallel Cloud Integration/API Management guide copies are excluded to avoid repeated content and mixed navigation terminology. Python SDK sources include current `docs-python` content; historical version folders are excluded.

SAP-docs repositories carry CC-BY-4.0 notices; SAP Cloud SDK, AI SDK, and OData vocabularies carry Apache-2.0 notices. The source checkouts retain their upstream license files, and search/fetch results link to the original documents. See [source expansion plan](docs/source-expansion-plan.md) for validation and scope.

### Online sources (live queries, enabled by default)

| Source | Description |
|--------|-------------|
| SAP Help Portal | Official SAP product documentation (broad scope) |
| SAP Community | Community blogs, Q&A, and troubleshooting posts |
| Software Heroes | ABAP/RAP articles and tutorials (EN + DE, deduplicated) |

## Available Tools

### Shared tools (both variants)

| Tool | Description |
|------|-------------|
| `search` | Unified search (BM25 with optional semantic ranking) across offline docs and optional online sources. Supports `query`, `k`, `includeOnline`, `includeSamples`, `abapFlavor`, `sources` parameters. |
| `fetch` | Retrieve full document content by ID returned from `search`. |
| `abap_feature_matrix` | Check ABAP feature availability across SAP releases (7.40–LATEST) using the [Software Heroes feature matrix](https://software-heroes.com/en/abap-feature-matrix). |
| `sap_community_search` | Dedicated SAP Community search via the Khoros LiQL API — returns full content of top posts. Use when `search` results are insufficient for specific errors or workarounds. |
| `sap_search_objects` | Search SAP released objects (classes, interfaces, tables, CDS views, …) by name/component/type from the official [SAP/abap-atc-cr-cv-s4hc](https://github.com/SAP/abap-atc-cr-cv-s4hc) release state repo. Useful for clean core compliance discovery. |
| `sap_get_object_details` | Full release state details for a specific SAP object including clean core level (A/B/C/D), successor objects, and optional compliance verdict. |

### `sap-docs` variant only

| Tool | Description |
|------|-------------|
| `sap_discovery_center_search` | Search the SAP Discovery Center service catalog for BTP services by keyword, category, or license model. |
| `sap_discovery_center_service` | Get comprehensive BTP service details: pricing plans, product roadmap, documentation links, and key features. Accepts a service UUID or name. |
| `ui5_version_diff` | List all matching FEATURE / FIX / DEPRECATED changes and SAPUI5 What's New entries for a version or range from a local all-changes bundle (`dist/data/ui5-lib-diff/all-changes.json`). `npm run setup` refreshes it automatically; use `npm run download:ui5-lib-diff` during setup/rebuild for a manual refresh. Pair with the [`ui5-version-upgrade` skill](.claude/skills/ui5-version-upgrade/SKILL.md) and `@ui5/mcp-server` for a full upgrade workflow. |

### `abap` variant only

| Tool | Description |
|------|-------------|
| `abap_lint` | Run static code analysis on ABAP source code using abaplint. Auto-detects file type from code patterns. Returns findings with line numbers, severity, and rule keys. |

## Architecture Overview

- Upstream source of truth: `mcp-sap-docs`
- One-way sync target: `abap-mcp-server`
- Search defaults to **BM25 keyword ranking**; optional semantic scores are combined via Reciprocal Rank Fusion (RRF)
- Embeddings model: `Xenova/all-MiniLM-L6-v2` (~90 MB, cached in `dist/models/`)

## Variant Selection

Resolution order:

1. `MCP_VARIANT` environment variable
2. `.mcp-variant` file in repo root
3. fallback: `sap-docs`

Examples:

```bash
# Run as full sap-docs profile
MCP_VARIANT=sap-docs npm run setup
MCP_VARIANT=sap-docs npm run build
MCP_VARIANT=sap-docs npm run start:streamable

# Run as ABAP profile
MCP_VARIANT=abap npm run setup
MCP_VARIANT=abap npm run build
MCP_VARIANT=abap npm run start:streamable
```

## Search Behavior

`search` performs fused retrieval over:

- Offline FTS index (local submodule content)
- Optional online sources (`includeOnline=true`):
  - SAP Help
  - SAP Community
  - Software Heroes content search (EN/DE merge + dedupe)

Ranking and filtering highlights:

- **BM25 search with optional semantic ranking** — keyword and meaning, fused via RRF
- Reciprocal Rank Fusion (RRF) across offline and online sources
- Source-level boosts from metadata
- `includeSamples` can remove sample-heavy sources
- `abapFlavor` (`standard` / `cloud` / `auto`) filters official ABAP docs libraries while keeping non-ABAP sources
- `sources` can restrict offline libraries explicitly

## Fetch content limits

Community post bodies are returned as Markdown, including code, links, images and
tables. Clients that previously parsed raw Community HTML must consume Markdown.
Document IDs, source URLs and response schemas are unchanged.
If conversion fails, that post keeps its original HTML with a notice; other
posts in the same batch are still returned.

SAP Help and Community fetches default to 75,000 characters. Shortened results
include `metadata.truncation` with exact loss counts. Self-hosted servers can set
`MAX_CONTENT_LENGTH` before startup; see [content size limits](docs/CONTENT-SIZE-LIMITS.md).

## Hybrid Search

Offline search defaults to BM25 keyword ranking. Optional semantic ranking uses
`Xenova/all-MiniLM-L6-v2` to reorder the lexical candidates; it does not search outside
that candidate pool. Enable it explicitly with `EMBEDDING_WEIGHT=0.7` after building
complete document and section embeddings and evaluating your own queries.

Embeddings are stored in `docs.sqlite`, with the model cached in `dist/models/`.
Old or partial embedding artifacts fall back to lexical ranking with a rebuild warning.
See [docs/HYBRID-SEARCH.md](docs/HYBRID-SEARCH.md) for setup, limitations and costs.

## Offline-Only Mode

`search` includes online sources by default. To run offline-only, use:

- local index/submodules only (`npm run setup` + `npm run build`)
- `includeOnline=false` in each `search` request

Example `search` request body:

```json
{
  "query": "RAP draft",
  "k": 8,
  "includeOnline": false
}
```

### Docker (offline-only)

Run the container with host binding and call `search` with `includeOnline=false`:

```bash
docker run --rm -p 3122:3122 \
  -e MCP_VARIANT=sap-docs \
  -e MCP_PORT=3122 \
  -e MCP_HOST=0.0.0.0 \
  mcp-sap-docs
```

For strict air-gapped execution, disable container networking:

```bash
docker run --rm --network none -p 3122:3122 \
  -e MCP_VARIANT=sap-docs \
  -e MCP_PORT=3122 \
  -e MCP_HOST=0.0.0.0 \
  mcp-sap-docs
```

Notes:

- With `--network none`, online fetches are impossible by runtime isolation.
- Startup may log warnings for online prefetch attempts (for example ABAP feature matrix); this does not prevent offline `search` usage.

## Quick Start (Local)

```bash
npm ci
npm run setup
npm run build
```

`npm run setup` updates the selected variant's documentation sources to their
configured branch tips and builds the index, including embeddings. Nested
submodules stay at the commits recorded by those sources. To omit optional nested
repositories (for example when their upstream URLs require SSH credentials), use
`SKIP_NESTED_SUBMODULES=1 npm run setup` in Bash, including Git Bash on Windows.

`npm run setup:submodules` instead checks out the repository's recorded source
commits. It does not fetch the latest documentation or apply variant filtering.
Run `npm run setup` when refreshing an existing installation.

Start server modes:

```bash
# MCP stdio
npm start

# HTTP status/dev server
npm run start:http

# MCP streamable HTTP
npm run start:streamable
```

Default ports by variant:

- `sap-docs`: HTTP `3001`, streamable `3122`
- `abap`: HTTP `3002`, streamable `3124`

Health checks:

```bash
curl -sS http://127.0.0.1:3122/health | jq .
curl -sS http://127.0.0.1:3001/status | jq .
```

Use variant-specific ports when running `abap` profile.

## Build and Setup Scripts

Script names remain shared (`setup`, `build`, `start`, `start:streamable`).
Behavior changes by variant config:

- `setup.sh` only initializes variant-allowed submodules
- `build-index` only includes variant-allowed libraries
- `build-fts` only indexes variant-allowed libraries

This keeps `abap` faster and smaller without maintaining a separate build script set.

## Docker

Build image for a variant:

```bash
# sap-docs image
docker build --build-arg MCP_VARIANT=sap-docs -t mcp-sap-docs .

# abap image
docker build --build-arg MCP_VARIANT=abap -t abap-mcp-server .
```

Run streamable server:

```bash
# sap-docs
docker run --rm -p 3122:3122 \
  -e MCP_VARIANT=sap-docs \
  -e MCP_PORT=3122 \
  mcp-sap-docs

# abap
docker run --rm -p 3124:3124 \
  -e MCP_VARIANT=abap \
  -e MCP_PORT=3124 \
  abap-mcp-server
```

## SAP BTP Cloud Foundry

For BTP CF, the recommended `sap-docs` path is to deploy the maintained
`ghcr.io/marianfoo/mcp-sap-docs:sap-docs` image with MTA. Cloud Foundry only
pulls and runs the prepared image, including embedding artifacts. Ranking remains
lexical unless a positive `EMBEDDING_WEIGHT` is explicitly configured.

See [docs/BTP-CF-DEPLOYMENT.md](docs/BTP-CF-DEPLOYMENT.md) for the public-first
deployment guide. Start with
[Deployment Options and Tradeoffs](docs/BTP-CF-DEPLOYMENT.md#deployment-options-and-tradeoffs)
to choose between MTA, direct `cf push`, custom registry images, and refresh
setup.

## One-Way Sync to `abap-mcp-server`

This repository contains direct sync automation:

- Workflow: `.github/workflows/sync-to-abap-main.yml`
- Script: `scripts/sync-to-abap.sh`

Flow:

1. Release Please publishes a release in `mcp-sap-docs` after its release PR is merged
2. The release workflow explicitly dispatches the ABAP sync workflow
3. The sync workflow clones `abap-mcp-server`
4. Tracked upstream files are synced (with exclude rules), then the ABAP overlay is applied
5. `.mcp-variant` is forced to `abap` and ABAP package identity is patched
6. A sync commit is pushed to `abap-mcp-server/main`
7. That push triggers the ABAP deployment workflow

The sync workflow also supports manual runs, including dry runs and a custom target branch.
Only pushes to the downstream `main` branch trigger automatic deployment.

Required secret in `mcp-sap-docs` repo:

- `ABAP_REPO_SYNC_TOKEN`: a dedicated token with access to push code and workflow
  changes to `abap-mcp-server`. Keep this separate from `GITHUB_TOKEN`, whose
  pushes do not trigger subsequent workflows.

## Deployment Model

- `mcp-sap-docs`: owns release versions and dispatches its deployment and ABAP sync when a release is created
- `abap-mcp-server`: deploys on pushes to `main`, including upstream sync commits, or via `workflow_dispatch`

The downstream repository does not publish GitHub releases. Its deployment must
therefore listen for sync pushes, not `release: published`. Upstream releases
control when automatic syncs occur.

The ABAP deployment workflow is maintained in
`sync/abap.overlay/.github/workflows/deploy-abap-mcp-server.yml`. Change that
upstream overlay so the fix persists across future syncs.

After merging a deployment fix, publish the next upstream release or manually run
`sync-to-abap-main.yml` against upstream `main`. Confirm that the downstream deploy
run succeeds and that `https://mcp-abap.marianzeis.de/health` reports the version in
the synced ABAP `package.json`; a successful sync alone does not confirm deployment.

## PM2 Runtime

`ecosystem.config.cjs` is variant-aware and resolves:

- process names
- ports
- deploy path

from `config/variants/*.json`.

## Validation Commands

```bash
npm run build:tsc
npm run test:url-generation
npm run test:integration
npm run test:software-heroes
npm run test:discovery-center # mocked Discovery Center REST contract tests
npm run test:discovery-center:live # opt-in live API smoke test
npm run test:sap-objects       # SAP Released Objects unit tests

# Variant-specific build checks
MCP_VARIANT=sap-docs npm run build:index
MCP_VARIANT=abap npm run build:index
MCP_VARIANT=sap-docs npm run build:fts
MCP_VARIANT=abap npm run build:fts
```

## Additional Docs

- `docs/ARCHITECTURE.md`
- `docs/DEV.md`
- `docs/TESTS.md`
- `docs/UPSTREAM-ONE-WAY-SYNC-IMPLEMENTATION.md`
- `REMOTE_SETUP.md`

[werkbank-badge]: assets/add-to-werkbank.svg
[werkbank-install]: https://getwerkbank.com/install-mcp?name=sap-docs&config=eyJ0eXBlIjoic3RyZWFtYWJsZV9odHRwIiwidXJsIjoiaHR0cHM6Ly9tY3Atc2FwLWRvY3MubWFyaWFuemVpcy5kZS9tY3AiLCJkZXNjcmlwdGlvbiI6IlNBUCBkb2N1bWVudGF0aW9uLCBub3RlcyBhbmQgY29tbXVuaXR5IHNlYXJjaCJ9

### Curated SAP tutorials

The SAP Docs profile includes 32 additional official tutorials in
`sap-tutorials-ai`, `sap-tutorials-hana`, and `sap-tutorials-integration`:
AI Core orchestration V2 and grounding, HANA Cloud SQLScript and CAP, Integration
Suite MCP Gateway, and Cloud Transport Management. The existing Fiori OPA guide
is still available separately.

Use product and task terms, for example `SAP HANA Cloud SQLScript stored procedure
tutorial` or `SAP Integration Suite MCP Gateway tutorial`. Use `sources` to narrow
an ambiguous search; leave it unset for cross-source discovery. Tutorials provide
worked examples and retain their prerequisites; product and SDK documentation
remain the reference for detailed API behavior.

The explicit selection is in [`config/tutorials.json`](config/tutorials.json).
Fetched tutorials include readable option labels, absolute asset/prerequisite
links, and their published page URL. The unpublished transport overview links to
its official GitHub source. Source content and its original attribution are
preserved; the original tutorial repository's license still applies.
