# MCP SAP Docs (Upstream)

An MCP server that gives AI assistants (Claude, Cursor, ChatGPT, etc.) access to SAP documentation through a unified search and fetch interface. It combines a local full-text + semantic index over git-cloned SAP docs with optional live queries to SAP Help, SAP Community, and Software Heroes — all exposed as MCP tools.

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
| `search` | Unified hybrid search (BM25 + semantic) across offline docs and optional online sources. Supports `query`, `k`, `includeOnline`, `includeSamples`, `abapFlavor`, `sources` parameters. |
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

### `abap` variant only

| Tool | Description |
|------|-------------|
| `abap_lint` | Run static code analysis on ABAP source code using abaplint. Auto-detects file type from code patterns. Returns findings with line numbers, severity, and rule keys. |

## Architecture Overview

- Upstream source of truth: `mcp-sap-docs`
- One-way sync target: `abap-mcp-server`
- Search uses **Hybrid BM25 + Semantic (embedding)** fusion via Reciprocal Rank Fusion (RRF)
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

- **Hybrid BM25 + Semantic (embedding) search** — keyword and meaning, fused via RRF
- Reciprocal Rank Fusion (RRF) across offline and online sources
- Source-level boosts from metadata
- `includeSamples` can remove sample-heavy sources
- `abapFlavor` (`standard` / `cloud` / `auto`) filters official ABAP docs libraries while keeping non-ABAP sources
- `sources` can restrict offline libraries explicitly

## Hybrid Search

The offline search combines BM25 (FTS5 keyword matching) with semantic similarity
(dense embeddings via `Xenova/all-MiniLM-L6-v2`). This allows natural-language and
paraphrase queries to find relevant docs even when the exact keywords are missing.

Example: _"how to check if a user has permission"_ finds `AUTHORITY-CHECK` docs.

Embeddings are pre-computed at build time and stored in `docs.sqlite`.
The model (~90 MB) is cached in `dist/models/` (gitignored, in-project).

See [docs/HYBRID-SEARCH.md](docs/HYBRID-SEARCH.md) for full details, size impact, and tuning.

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

## One-Way Sync to `abap-mcp-server`

This repository contains direct sync automation:

- Workflow: `.github/workflows/sync-to-abap-main.yml`
- Script: `scripts/sync-to-abap.sh`

Flow:

1. Push to `mcp-sap-docs/main`
2. Workflow clones `abap-mcp-server`
3. Tracked upstream files are synced (with exclude rules)
4. ABAP overlay is applied
5. `.mcp-variant` is forced to `abap`
6. ABAP package identity is patched
7. Commit is pushed to `abap-mcp-server/main`

Required secret in `mcp-sap-docs` repo:

- `ABAP_REPO_SYNC_TOKEN`

Commit message controls:

- `[skip-sync]` skips sync workflow

## Deployment Model

- `mcp-sap-docs`: upstream implementation + sync trigger
- `abap-mcp-server`: deployment trigger remains push-to-main in that repository

This preserves ABAP deployment automation while keeping one shared upstream codebase.

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
