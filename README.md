# SAP Documentation MCP Server

An MCP server that unifies official SAP docs (SAPUI5, CAP, OpenUI5 APIs & samples, wdi5) with real-time SAP Community content.
Use it remotely (hosted URL) or run it locally and point your client to STDIO.

**Public server**: https://mcp-sap-docs.marianzeis.de/sse  
**Local HTTP status**: http://127.0.0.1:3001/status  
**Proxy status (SSE gateway)**: http://127.0.0.1:18080/status  

---

## Quick start

<details>
<summary><b>Use the hosted server (recommended)</b></summary>

Point your MCP client to the SSE URL:

```
https://mcp-sap-docs.marianzeis.de/sse
```

Verify from a shell:

```bash
# Should return JSON with api_last_activity
curl -sS https://mcp-sap-docs.marianzeis.de/status | jq .

# Should return an SSE line like: "event: endpoint" with a /messages path
curl -i -H 'Accept: text/event-stream' https://mcp-sap-docs.marianzeis.de/sse | head
```

</details>

<details>
<summary><b>Run it locally (STDIO + local HTTP status)</b></summary>

```bash
# From repo root
npm ci
npm run build:index
npm run build

# Start the MCP server (STDIO)
node dist/src/server.js
```

The companion HTTP status server runs (via PM2 in your setup) on 127.0.0.1:3001.
The SSE proxy runs on 127.0.0.1:18080 and is what remote clients use.

**Local health checks**

```bash
# MCP proxy (SSE gateway)
curl -sS http://127.0.0.1:18080/status | jq .

# HTTP server
curl -sS http://127.0.0.1:3001/status | jq .
```

</details>

---

## What you get
- **sap_docs_search** – unified search across SAPUI5/CAP/OpenUI5 APIs & samples, wdi5, and more
- **sap_community_search** – real-time SAP Community posts with quality filtering  
- **sap_docs_get** – fetches full documents/snippets with smart formatting

---

## Connect from your MCP client

✅ **Remote URL**: use the public SSE endpoint  
✅ **Local/STDIO**: run `node dist/src/server.js` and point the client to a command + args

Below are copy-paste setups for popular clients. Each block has remote and local options.

---

## Claude (Desktop / Web "Connectors")

<details>
<summary><b>Remote (recommended) — add a custom connector</b></summary>

1. Open Claude Settings → Connectors → Add custom connector
2. Paste the URL:

```
https://mcp-sap-docs.marianzeis.de/sse
```

3. Save; Claude will perform the SSE handshake and obtain the /messages endpoint automatically.

(Claude documents the Remote MCP flow for SSE connectors [here](https://modelcontextprotocol.info/docs/clients/).)

**Docs**: Model Context Protocol ["Connect to Remote MCP Servers"](https://modelcontextprotocol.info/docs/clients/) (shows how Claude connects to SSE).

</details>

<details>
<summary><b>Local (STDIO) — add a local MCP server</b></summary>

Point Claude to the command and args:

```
command: node
args: ["<absolute-path-to-your-repo>/dist/src/server.js"]
```

Claude's [user quickstart](https://modelcontextprotocol.info/quickstart) shows how to add local servers by specifying a command/args pair.

</details>

---

## Cursor

<details>
<summary><b>Remote (SSE URL)</b></summary>

Create or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "sap-docs-remote": {
      "url": "https://mcp-sap-docs.marianzeis.de/sse"
    }
  }
}
```

Restart Cursor.

</details>

<details>
<summary><b>Local (STDIO)</b></summary>

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "sap-docs": {
      "command": "node",
      "args": ["/absolute/path/to/dist/src/server.js"]
    }
  }
}
```

Restart Cursor.

</details>

---

## VS Code (GitHub Copilot Chat)

<details>
<summary><b>Add an MCP server</b></summary>

Open Copilot Chat → gear icon → MCP Servers → Add.
You can add by command (local/STDIO) or by URL (remote HTTP/SSE) using the built-in wizard.
Microsoft's ["Add an MCP server"](https://code.visualstudio.com/docs/copilot/copilot-mcp) doc walks through this flow.

**Remote (URL)**:
```
https://mcp-sap-docs.marianzeis.de/sse
```

**Local (command)**:
```
command: node
args: ["<absolute-path>/dist/src/server.js"]
```

</details>

---

## Zed Editor

<details>
<summary><b>Remote (URL server) & Local (Program server)</b></summary>

- **URL Server** → add the SSE URL:
```
https://mcp-sap-docs.marianzeis.de/sse
```

- **Program Server** → point to:
```
command: node
args: ["<absolute-path>/dist/src/server.js"]
```

Zed's docs show how to add URL or Program MCP servers from Project → Settings → MCP Servers.

</details>

---

## Windsurf

<details>
<summary><b>Remote & Local</b></summary>

- **Remote URL (SSE)**:
```
https://mcp-sap-docs.marianzeis.de/sse
```

- **Local command**:
```
node <absolute-path>/dist/src/server.js
```

Open Settings → Cascade → MCP and add a server (URL or Command).

</details>

---

## LM Studio

<details>
<summary><b>Remote (URL) & Local (command)</b></summary>

- **Remote URL (SSE)**:
```
https://mcp-sap-docs.marianzeis.de/sse
```

- **Local command**:
```
node <absolute-path>/dist/src/server.js
```

In LM Studio, go to Program → Install → Edit mcp.json (or use their Add MCP Server flow).
Then add either a url entry (remote) or command/args (local).

</details>

---

## Goose (desktop & CLI)

<details>
<summary><b>Remote (SSE)</b></summary>

In Goose Settings → Extensions → Add custom extension:
- Type: Remote Extension (SSE)
- Endpoint:
```
https://mcp-sap-docs.marianzeis.de/sse
```

(Goose docs show similar steps for adding remote MCP endpoints as "Remote Extension".)

</details>

---

## Gemini CLI

<details>
<summary><b>Remote & Local</b></summary>

Add an MCP entry in your Gemini CLI settings (see their MCP guide), using either:
- **Remote URL**:
```
https://mcp-sap-docs.marianzeis.de/sse
```

- **Local command**:
```
node <absolute-path>/dist/src/server.js
```

</details>

---

## Features

### 🔍 Dual Search System
- **sap_docs_search**: Search official SAP documentation, APIs, sample code, and wdi5 docs
- **sap_community_search**: Search real-time SAP Community content

### 📚 Comprehensive Coverage
- **1,485+ SAPUI5 files** - Complete developer guide
- **195+ CAP files** - Cloud Application Programming model  
- **500+ OpenUI5 APIs** - Control APIs with detailed JSDoc
- **2,000+ sample files** - Working examples from `demokit/sample` directories
- **wdi5 E2E test framework docs** - End-to-end testing documentation
- **Real-time community content** - Live posts with engagement filtering

### 🌐 SAP Community Integration
- High-quality community blog posts, solutions, and discussions
- Live content fetched in real-time with quality filtering (kudos > 5)
- Real-world developer knowledge and practical insights

### 💡 Smart Features
- Automatic code highlighting and sample categorization
- Context-aware search with intelligent scoring
- Source-specific results for targeted searches

---

## What's Included

### Official Documentation
- **SAPUI5 Documentation** (`/sapui5`) - Complete developer guide with 1,485+ files
- **CAP Documentation** (`/cap`) - Cloud Application Programming model with 195+ files  
- **OpenUI5 API Documentation** (`/openui5-api`) - 500+ control APIs with detailed JSDoc
- **OpenUI5 Sample Code** (`/openui5-samples`) - 2,000+ working examples
- **wdi5 Documentation** (`/wdi5`) - End-to-end test framework documentation

### Community Content
- **Blog Posts** - Technical tutorials and deep-dives from SAP Community
- **Solutions** - Real-world answers to common development problems
- **Best Practices** - Community-tested approaches and patterns
- **Code Examples** - Practical implementations shared by developers
- **High-Quality Filter** - Only posts with kudos > 5 for quality assurance

---

## Usage Examples

### Search Official Documentation
```
Use sap_docs_search with: "wdi5 configuration"
```
**Returns**: wdi5 documentation about configuration, setup, and usage.

### Get Specific Documentation
```
Use sap_docs_get with: /wdi5
```
**Returns**: wdi5 documentation overview

### Search SAP Community
```
Use sap_community_search with: "wdi5 best practices"
```
**Returns**: Recent community posts, blog articles, and discussions about wdi5 best practices.

### Find Sample Implementations
```
Use sap_docs_search with: "button click handler"
```
**Returns**: 
- Official button documentation
- Sample button implementations with JS controllers
- XML view examples

---

## Example Prompts

Try these with any connected MCP client:

- "How do I implement authentication in SAPUI5?"
- "Show me wdi5 testing examples for forms"
- "What are the latest CAP authentication best practices?"
- "Find community examples of OData batch operations"
- "Search for temporal data handling in CAP"

---

## Troubleshooting

<details>
<summary><b>Claude says it can't connect</b></summary>

- Make sure the URL is the SSE URL:
`https://mcp-sap-docs.marianzeis.de/sse` (not /messages, not /status).
- Test SSE from your machine:

```bash
curl -i -H 'Accept: text/event-stream' https://mcp-sap-docs.marianzeis.de/sse | head
```

You should see `event: endpoint` and a `/messages?...` path. (This is the expected SSE handshake for remote MCP servers.)

</details>

<details>
<summary><b>VS Code wizard can't detect the server</b></summary>

- Try adding it as URL first. If your network blocks SSE, use your local server via command:
```
node <absolute-path>/dist/src/server.js
```

- Microsoft's ["Add an MCP server"](https://code.visualstudio.com/docs/copilot/copilot-mcp) guide shows both URL and command flows.

</details>

<details>
<summary><b>Local server runs, but the client can't find it</b></summary>

- Ensure you're pointing to the built entry:
```
node dist/src/server.js
```

- If using PM2/systemd, confirm it's alive:
```bash
pm2 status mcp-sap-http
pm2 status mcp-sap-proxy
curl -fsS http://127.0.0.1:3001/status | jq .
curl -fsS http://127.0.0.1:18080/status | jq .
```

</details>

---

## Development

### Build Commands
```bash
npm run build        # Compile TypeScript
npm run build:index  # Build search index from sources
npm run build:fts    # Build FTS5 database
```

### Local Setup
```bash
git clone https://github.com/marianfoo/mcp-sap-docs.git
cd mcp-sap-docs
./setup.sh           # Clone/update sources and build FTS
npm run build:index  # Build index.json
npm run build        # Compile TypeScript
```

The build process creates optimized search indices for fast offline access while maintaining real-time connectivity to the SAP Community API.

---

## Health & Status Monitoring

### Public Endpoints
```bash
# Check server status
curl -sS https://mcp-sap-docs.marianzeis.de/status | jq .

# Test SSE connection
curl -i -H 'Accept: text/event-stream' https://mcp-sap-docs.marianzeis.de/sse | head
```

### Local Endpoints
```bash
# HTTP server status
curl -sS http://127.0.0.1:3001/status | jq .

# SSE proxy status  
curl -sS http://127.0.0.1:18080/status | jq .
```

---

## Deployment

### Automated Workflows
This project includes dual automated workflows:

1. **Main Deployment** (on push to `main`)
   - SSH into server and pull latest code + submodules
   - Update documentation sources and rebuild indices
   - Restart services with health checks

2. **Daily Documentation Updates** (4 AM UTC)
   - Update all documentation submodules to latest versions
   - Rebuild search indices with fresh content
   - Restart services automatically

### Manual Updates
Trigger documentation updates anytime via GitHub Actions → "Update Documentation Submodules" workflow.

---

## Architecture

- **MCP Server** (Node.js/TypeScript) - Exposes Resources/Tools for SAP docs & community
- **SSE Proxy** (Python) - Bridges STDIO → URL for remote clients  
- **Reverse Proxy** (Caddy) - TLS termination and routing
- **Search Engine** - SQLite FTS5 + JSON indices for fast local search
- **Community API** - Real-time integration with SAP Community

---

## Project Statistics

- **Total Files**: 4,180+ documentation files + real-time community content
- **SAPUI5 Docs**: 1,485 markdown files
- **CAP Docs**: 195 markdown files  
- **OpenUI5 APIs**: 500+ JavaScript control definitions
- **Sample Code**: 2,000+ implementation examples
- **Community Posts**: Real-time access to filtered, high-quality content
- **Search Database**: 8+ MB FTS5 database with 14,822+ indexed documents

---

## License

MIT

---

## References
- [Model Context Protocol — Quickstart for users](https://modelcontextprotocol.info/quickstart) (local servers).
- [Model Context Protocol — Connect to remote MCP servers](https://modelcontextprotocol.info/docs/clients/) (SSE).
- [VS Code / GitHub Copilot Chat — Add an MCP server](https://code.visualstudio.com/docs/copilot/copilot-mcp).
- [Zed — Model Context Protocol](https://zed.dev/docs/extensions/mcp).

If you need additional client snippets (e.g., Qodo Gen, other tools), please open an issue with your specific client requirements.