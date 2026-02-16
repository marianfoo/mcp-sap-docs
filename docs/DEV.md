# Development Guide

This guide describes the current development model for `mcp-sap-docs`.

## Scope

`mcp-sap-docs` is the upstream repository for two runtime profiles:

- `sap-docs` (broad SAP docs)
- `abap` (ABAP-focused, reduced sources, `abap_lint` enabled)

Both profiles use the same code and scripts.

## Prerequisites

- Node.js 22+
- npm
- git (for submodules)
- sqlite runtime support via `better-sqlite3`

## Initial Setup

```bash
npm ci
npm run setup
npm run build
```

The setup script is variant-aware:

- resolves variant from `MCP_VARIANT` -> `.mcp-variant` -> `sap-docs`
- initializes only submodules allowed by that variant

## Common Commands

```bash
# build
npm run build:tsc
npm run build:index
npm run build:fts
npm run build

# runtime
npm start
npm run start:http
npm run start:streamable

# tests
npm run test:url-generation
npm run test:integration
npm run test:software-heroes
npm run test
```

## Variant Matrix During Development

Run both profiles before merging:

```bash
MCP_VARIANT=sap-docs npm run setup
MCP_VARIANT=sap-docs npm run build

MCP_VARIANT=abap npm run setup
MCP_VARIANT=abap npm run build
```

## Search Contract

The `search` tool contract is shared for both profiles:

- `query`
- `k`
- `includeOnline`
- `includeSamples`
- `abapFlavor`
- `sources`

Online search sources (when `includeOnline=true`):

- SAP Help
- SAP Community
- Software Heroes content search

`fetch` remains shared and unchanged.

## Tool Gating by Variant

Defined in `config/variants/*.json` and enforced by `src/lib/variant.ts` + `src/lib/BaseServerHandler.ts`:

- Both: `search`, `fetch`, `abap_feature_matrix`
- ABAP-only: `abap_lint`

## Key Files

- Variant resolution: `src/lib/variant.ts`
- Variant profiles: `config/variants/sap-docs.json`, `config/variants/abap.json`
- Tool handlers: `src/lib/BaseServerHandler.ts`
- Unified search: `src/lib/search.ts`
- Runtime config: `src/lib/config.ts`
- Metadata access: `src/lib/metadata.ts`
- Build index: `scripts/build-index.ts`
- Build FTS: `scripts/build-fts.ts`
- Setup/submodules: `setup.sh`
- Sync automation: `scripts/sync-to-abap.sh`
- Sync workflow: `.github/workflows/sync-to-abap-main.yml`

## One-Way Sync Workflow (Upstream -> ABAP Repo)

1. Push lands in `mcp-sap-docs/main`
2. `sync-to-abap-main.yml` executes
3. `scripts/sync-to-abap.sh` clones `abap-mcp-server`
4. Tracked files sync with excludes + overlay
5. `.mcp-variant` forced to `abap`
6. ABAP package identity patched
7. Commit pushed to `abap-mcp-server/main`

Required secret:

- `ABAP_REPO_SYNC_TOKEN`

Commit message controls:

- `[skip-sync]` to skip automated sync

## Deployment Notes

- PM2 config (`ecosystem.config.cjs`) is variant-aware
- ABAP deploy workflow remains in `abap-mcp-server` and is triggered by pushes to its `main`

## Debugging Tips

```bash
# verify active variant
cat .mcp-variant

# explicit variant run
MCP_VARIANT=abap npm run start:streamable

# inspect tool list from integration tests or MCP inspector
npm run inspect
```
