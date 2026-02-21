# MCP SAP Docs (Upstream)

`mcp-sap-docs` is the upstream repository for two MCP server variants:

- `sap-docs` variant: broad SAP docs scope (UI5, CAP, Cloud SDK, ABAP docs, etc.)
- `abap` variant: ABAP-focused scope (fewer sources, ABAP lint enabled)

Both variants run from the same codebase and differ by configuration (`MCP_VARIANT` / `.mcp-variant`).

## Current State

- Upstream source of truth: `mcp-sap-docs`
- One-way sync target: `abap-mcp-server`
- Search API is unified across variants:
  - `query`, `k`, `includeOnline`, `includeSamples`, `abapFlavor`, `sources`
- Shared tools in both variants:
  - `search`
  - `fetch`
  - `abap_feature_matrix`
- ABAP-only tool:
  - `abap_lint` (enabled only when variant is `abap`)

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

- Reciprocal Rank Fusion (RRF) across offline and online sources
- Source-level boosts from metadata
- `includeSamples` can remove sample-heavy sources
- `abapFlavor` (`standard` / `cloud` / `auto`) filters official ABAP docs libraries while keeping non-ABAP sources
- `sources` can restrict offline libraries explicitly

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
