# Remote and Self-Hosted Setup

This guide reflects the current upstream model:

- Upstream codebase: `mcp-sap-docs`
- Variant behavior: `sap-docs` or `abap`
- ABAP repository sync target: `abap-mcp-server`

## 1. Use Hosted SAP Docs Endpoint

Use the streamable MCP endpoint directly:

```text
https://mcp-sap-docs.marianzeis.de/mcp
```

Quick checks:

```bash
curl -sS https://mcp-sap-docs.marianzeis.de/status | jq .
curl -sS https://mcp-sap-docs.marianzeis.de/health | jq .
```

## 2. Self-Host From This Repository

```bash
npm ci
MCP_VARIANT=sap-docs npm run setup
MCP_VARIANT=sap-docs npm run build
MCP_VARIANT=sap-docs npm run start:streamable
```

Defaults for `sap-docs`:

- streamable MCP: `http://127.0.0.1:3122/mcp`
- health: `http://127.0.0.1:3122/health`

Run ABAP-focused profile from same codebase:

```bash
MCP_VARIANT=abap npm run setup
MCP_VARIANT=abap npm run build
MCP_VARIANT=abap npm run start:streamable
```

Defaults for `abap`:

- streamable MCP: `http://127.0.0.1:3124/mcp`
- health: `http://127.0.0.1:3124/health`

## 3. PM2 Deployment

`ecosystem.config.cjs` is variant-aware and reads:

- `MCP_VARIANT` env var, then
- `.mcp-variant`

Then it configures process names, ports, and deploy path from `config/variants/<variant>.json`.

Example:

```bash
MCP_VARIANT=sap-docs pm2 start ecosystem.config.cjs
MCP_VARIANT=abap pm2 start ecosystem.config.cjs
```

## 4. Docker Deployment

Build and run by variant:

```bash
# sap-docs
docker build --build-arg MCP_VARIANT=sap-docs -t mcp-sap-docs .
docker run --rm -p 3122:3122 -e MCP_VARIANT=sap-docs -e MCP_PORT=3122 mcp-sap-docs

# abap
docker build --build-arg MCP_VARIANT=abap -t abap-mcp-server .
docker run --rm -p 3124:3124 -e MCP_VARIANT=abap -e MCP_PORT=3124 abap-mcp-server
```

## 5. One-Way Sync to `abap-mcp-server`

Automated in upstream via:

- `.github/workflows/sync-to-abap-main.yml`
- `scripts/sync-to-abap.sh`

Set this secret in `mcp-sap-docs` repository settings:

- `ABAP_REPO_SYNC_TOKEN`

Behavior:

- On push to `main`, upstream syncs into `abap-mcp-server/main`
- Workflow skips if commit message contains `[skip-sync]`
- ABAP repo deploy-on-push workflow remains the deployment trigger

## 6. Cursor MCP Config Example

```json
{
  "mcpServers": {
    "sap-docs-remote": {
      "url": "https://mcp-sap-docs.marianzeis.de/mcp"
    },
    "sap-docs-local": {
      "url": "http://127.0.0.1:3122/mcp"
    }
  }
}
```

For ABAP local variant, use `http://127.0.0.1:3124/mcp`.
