# Upstream One-Way Sync Implementation (Detailed)

Date: 2026-02-16  
Repository: `mcp-sap-docs` (upstream)

## 1. Goal and Requirement Premise

This implementation was driven by these requirements:

1. Keep one shared codebase while maintaining two repositories
2. Implement search improvements in upstream and reuse in ABAP downstream
3. Build/start either profile (`sap-docs` or `abap`) via configuration, not forked scripts
4. Provide Docker support for both variants
5. Pushes to upstream auto-sync to `abap-mcp-server/main`
6. Preserve ABAP repo push-triggered deployment

Core premise:

- `mcp-sap-docs` is the single source of truth
- `abap-mcp-server` is generated/synchronized output with ABAP identity and deployment

## 2. What Changed

## 2.1 Search Improvements (Upstream First)

Implemented in shared upstream modules:

- `src/lib/search.ts`
- `src/lib/config.ts`
- `src/lib/metadata.ts`

Search contract now supports:

- `query`
- `k`
- `includeOnline`
- `includeSamples`
- `abapFlavor`
- `sources`

Integrated online sources into unified search fusion:

- SAP Help
- SAP Community
- Software Heroes content search

Ranking/fusion:

- Reciprocal Rank Fusion (RRF)
- source/context boosts
- dedupe for merged sources

Why:

- one user-facing search interface
- better relevance from local + online evidence
- keeps ABAP and SAP Docs clients on same behavior model

## 2.2 Software Heroes Integration

Added:

- `src/lib/softwareHeroes/core.ts`
- `src/lib/softwareHeroes/contentSearch.ts`
- `src/lib/softwareHeroes/abapFeatureMatrix.ts`
- `src/lib/softwareHeroes/index.ts`

Added tests and fixtures:

- `test/software-heroes-afm.test.ts`
- `test/software-heroes-content-search.test.ts`
- `test/fixtures/abap-feature-matrix-sample.html`
- `test/fixtures/software-heroes-search-sample.html`

Why:

- required source expansion
- feature matrix support across profiles

## 2.3 Variant System (Single Codebase, Two Behaviors)

Added:

- `src/lib/variant.ts`
- `config/variants/sap-docs.json`
- `config/variants/abap.json`
- `config/variants/abap.metadata.json`
- `.mcp-variant` (default `sap-docs`)

Variant controls:

- source allowlist
- submodule allowlist
- tool gating
- server identity and port defaults
- PM2 service names
- deploy path hints
- metadata file

Why:

- avoids script/code forks
- keeps behavior explicit and reviewable
- allows ABAP reduction without duplicate codebase

## 2.4 Build/Setup/Runtime Became Config-Driven

Updated:

- `setup.sh`
- `scripts/build-index.ts`
- `scripts/build-fts.ts`
- `src/server.ts`
- `src/http-server.ts`
- `src/streamable-http-server.ts`
- `ecosystem.config.cjs`

Behavior:

- same script names (`setup`, `build`, `start`, `start:streamable`)
- variant determines actual sources, ports, and identity

Why:

- operational simplicity
- predictable parity between local, CI, and deployment

## 2.5 Tool Surface Harmonization

Updated:

- `src/lib/BaseServerHandler.ts`

Result:

- shared tools: `search`, `fetch`, `abap_feature_matrix`
- ABAP-only tool: `abap_lint` (variant-gated)
- search schema aligned with required parameter set

Why:

- fulfills shared API requirement
- keeps ABAP specialization minimal and explicit

## 2.6 One-Way Upstream Sync Automation

Added:

- `.github/workflows/sync-to-abap-main.yml`
- `scripts/sync-to-abap.sh`
- `sync/abap.sync-exclude`
- `sync/abap.overlay/README.md`
- `sync/abap.overlay/REMOTE_SETUP.md`
- `sync/abap.overlay/server.json`

Workflow behavior:

- trigger: push to `main` + manual dispatch
- uses `ABAP_REPO_SYNC_TOKEN`
- applies excludes/overlay
- sets `.mcp-variant=abap`
- patches ABAP package identity
- pushes to `abap-mcp-server/main`
- skip marker: `[skip-sync]`

Why:

- eliminates manual cherry-picking
- keeps ABAP repo deployment trigger unchanged
- preserves ABAP repository branding/runtime metadata

## 2.7 Docker Support for Both Variants

Added/updated:

- `Dockerfile`
- `.dockerignore`

Behavior:

- build arg `MCP_VARIANT` supported
- variant configs copied into runtime image
- `.mcp-variant` included
- health check uses `MCP_PORT`

Why:

- single container recipe for both profiles
- consistent behavior with local/PM2 variant model

## 3. Requirement-to-Change Mapping

1. Search improvements in upstream
   - implemented in shared `search.ts` + handler schemas + tests

2. Build/start either SAP Docs or ABAP via config
   - implemented through `variant.ts`, profile JSONs, and variant-aware scripts

3. Docker for both MCP servers
   - implemented via variant-aware Dockerfile and runtime env controls

4. Deployment for both MCP servers
   - upstream sync workflow pushes ABAP repo
   - ABAP repo keeps push-trigger deploy workflow

5. Two repositories with shared codebase
   - one-way upstream model with controlled sync + overlay

## 4. Decisions and Rationale

1. One-way sync over bi-directional merges
   - avoids drift/conflict loops
   - keeps architecture ownership clear

2. Variant gating over separate code forks
   - less maintenance
   - lower regression risk

3. Keep public script names stable
   - easier operations and CI migration

4. Keep deployment trigger in ABAP repo
   - preserves existing production flow

## 5. Operational Requirements

For automatic sync:

- set `ABAP_REPO_SYNC_TOKEN` in `mcp-sap-docs` secrets

Recommended rollout order:

1. merge upstream changes to `mcp-sap-docs/main`
2. run sync workflow manually once (`workflow_dispatch`)
3. verify push landed in `abap-mcp-server/main`
4. verify ABAP deploy workflow completed successfully
5. keep push-trigger sync enabled

## 6. Known Constraints

- Sync script is intentionally one-way
- Exclude/overlay controls are critical for preserving ABAP-specific repo files
- Variant source lists must stay aligned with `.gitmodules` and metadata

## 7. Verification Summary

Validated in implementation cycle:

- TypeScript compile success
- URL/prompt/Software Heroes tests passing
- variant-aware tool gating confirmed
- variant build/index flows confirmed
- streamable health checks confirmed
- sync dry-run executed successfully
