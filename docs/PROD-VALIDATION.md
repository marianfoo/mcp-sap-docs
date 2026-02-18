# Production Validation (Manual)

Use this after publishing to verify both live servers are reachable and core tools work.

Script:

- `scripts/test-live-prod.mjs`

## Quick smoke (recommended first)

From repository root:

```bash
npm run test:prod
```

This validates:

- `GET /health`
- `GET /status` (required on both servers)
- MCP `initialize` (streamable HTTP)
- `tools/list` contract
- sample `search` calls (including `includeOnline`, `includeSamples`, `abapFlavor`, `sources`)
- `fetch` roundtrip from a search result

## Deeper smoke (online behavior)

```bash
npm run test:prod -- --online
```

Adds:

- sample online `search` with `includeOnline=true`
- `abap_feature_matrix` check (required)

## Run one server only

```bash
# only sap-docs
npm run test:prod -- --server sap-docs

# only abap
npm run test:prod -- --server abap
```

## Override target URLs

```bash
npm run test:prod -- \
  --sap-url https://your-sap-host.example.com \
  --abap-url https://your-abap-host.example.com
```

Or via env vars:

```bash
SAP_DOCS_URL=https://your-sap-host.example.com \
ABAP_MCP_URL=https://your-abap-host.example.com \
npm run test:prod
```

## Timeout override

```bash
npm run test:prod -- --timeout-ms 40000
```

or:

```bash
PROD_TEST_TIMEOUT_MS=40000 npm run test:prod
```

## Exit behavior

- exit `0`: all selected checks passed
- exit `1`: one or more checks failed
- exit `2`: invalid script arguments
