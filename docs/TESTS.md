# Testing Guide

This guide reflects the current test commands and validation strategy.

## Primary Commands

```bash
# TypeScript compile check
npm run build:tsc

# URL generation + prompts + ABAP feature matrix unit coverage
npm run test:url-generation

# End-to-end tool integration (build + runtime test harness)
npm run test:integration

# Software Heroes focused tests
npm run test:software-heroes

# SAP Released Objects unit tests (buildDataStore, search, compliance)
npm run test:sap-objects

# Full suite used in CI/local gate
npm run test
```

## Variant Validation Matrix

Run these checks for both profiles:

```bash
MCP_VARIANT=sap-docs npm run build:index
MCP_VARIANT=sap-docs npm run build:fts

MCP_VARIANT=abap npm run build:index
MCP_VARIANT=abap npm run build:fts
```

Expected behavior:

- `sap-docs` includes broad source set
- `abap` includes reduced ABAP-focused source set

## Contract Checks

### Search Tool Inputs

The `search` tool must expose:

- `query`
- `k`
- `includeOnline`
- `includeSamples`
- `abapFlavor`
- `sources`

### Tool Availability by Variant

- `sap-docs`: `search`, `fetch`, `abap_feature_matrix`, `sap_community_search`, `sap_search_objects`, `sap_get_object_details`
- `abap`: same as `sap-docs` plus `abap_lint`

## Streamable HTTP Smoke Checks

```bash
# sap-docs
MCP_VARIANT=sap-docs MCP_PORT=3122 npm run start:streamable
curl -sS http://127.0.0.1:3122/health | jq .

# abap
MCP_VARIANT=abap MCP_PORT=3124 npm run start:streamable
curl -sS http://127.0.0.1:3124/health | jq .
```

## Sync Dry Run Check

Validate one-way sync without pushing:

```bash
DRY_RUN=1 TARGET_BRANCH=main bash scripts/sync-to-abap.sh
```

Expected:

- script completes successfully
- reports dry-run commit summary
- no push performed

## Common Failure Areas

- missing submodule content for selected variant
- metadata path mismatch for variant
- outdated local build artifacts after variant switch
- missing `ABAP_REPO_SYNC_TOKEN` for non-dry-run sync workflow

## Recommended Local Gate Before Merge

```bash
npm run build:tsc
npm run test:url-generation
npm run test:sap-objects

MCP_VARIANT=sap-docs npm run build:index
MCP_VARIANT=abap npm run build:index

DRY_RUN=1 TARGET_BRANCH=main bash scripts/sync-to-abap.sh
```
