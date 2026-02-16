# ABAP MCP Remote Setup

This guide is for `abap-mcp-server` (ABAP-focused downstream repository).

## Remote Endpoint

Use:

```text
https://mcp-abap.marianzeis.de/mcp
```

## Cursor Configuration

```json
{
  "mcpServers": {
    "abap-mcp-remote": {
      "url": "https://mcp-abap.marianzeis.de/mcp"
    }
  }
}
```

Local alternative:

```json
{
  "mcpServers": {
    "abap-mcp-local": {
      "url": "http://127.0.0.1:3124/mcp"
    }
  }
}
```

## Local Run

```bash
npm ci
npm run setup
npm run build
npm run start:streamable
```

Default ABAP streamable port:

- `3124`

## Available Tools

- `search`
- `fetch`
- `abap_feature_matrix`
- `abap_lint`

## Notes

- `abap-mcp-server` is synchronized from `mcp-sap-docs` upstream.
- Pushes to `abap-mcp-server/main` trigger its deployment workflow.
