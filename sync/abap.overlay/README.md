# ABAP MCP Server

> Community project. This server is not an official SAP product.

## Public Hosted Endpoint

> **Ready to use — no setup required**
>
> **`https://mcp-abap.marianzeis.de/mcp`**

`abap-mcp-server` is the ABAP-focused downstream variant generated from upstream `mcp-sap-docs`.

## What This Variant Provides

- Unified ABAP/RAP search (`search`) — searches offline docs + optional online sources (SAP Help, SAP Community, Software Heroes)
- Document retrieval (`fetch`) — retrieve full document or community post content by ID
- ABAP feature matrix lookup (`abap_feature_matrix`)
- SAP Community search (`sap_community_search`) — dedicated community-only search for troubleshooting, error messages, and workarounds not found via `search`
- Local ABAP linting (`abap_lint`)

Search parameters:

- `query`
- `k`
- `includeOnline`
- `includeSamples`
- `abapFlavor`
- `sources`

## Quick Start

```bash
git clone https://github.com/marianfoo/abap-mcp-server.git
cd abap-mcp-server
npm ci
npm run setup
npm run build
npm run start:streamable
```

Default local streamable endpoint:

- `http://127.0.0.1:3124/mcp`

Health:

- `http://127.0.0.1:3124/health`

## Eclipse / Copilot Example

```json
{
  "servers": {
    "abap-mcp": {
      "type": "http",
      "url": "https://mcp-abap.marianzeis.de/mcp"
    }
  }
}
```

## Notes

- This repository is synchronized from upstream `mcp-sap-docs`.
- ABAP deployment remains push-driven in `abap-mcp-server`.
