# SAP Documentation MCP Server

A fast, lightweight MCP server that provides unified access to official SAP documentation (SAPUI5, CAP, OpenUI5 APIs & samples, wdi5) using efficient BM25 full-text search.
Use it remotely (hosted URL) or run it locally and point your client to STDIO.

**Public server STDIO**: https://mcp-sap-docs.marianzeis.de/sse  
**Public server Streamable HTTP**: https://mcp-sap-docs.marianzeis.de/mcp
**Streamable HTTP (default: 3122, configurable via MCP_PORT)**: http://127.0.0.1:3122/mcp  
_(by default, both local and deployment use port 3122; override with MCP_PORT as needed)_  
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

or the Streamable HTTP URL:

```
https://mcp-sap-docs.marianzeis.de/mcp
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
<summary><b>Run it locally (STDIO + local HTTP status + Streamable HTTP)</b></summary>

```bash
# From repo root
npm ci
./setup.sh # execute this script to clone the github documentation submodules
npm run build

# Start the MCP server (STDIO)
node dist/src/server.js

# OR start the Streamable HTTP server
npm run start:streamable
```

**Local health checks**

```bash
# MCP proxy (SSE gateway)
curl -sS http://127.0.0.1:18080/status | jq .

# HTTP server
curl -sS http://127.0.0.1:3001/status | jq .

# Streamable HTTP server (local & deployment default)
curl -sS http://127.0.0.1:3122/health | jq .
```

</details>

---

## What you get
- **sap_docs_search** – unified search across multiple SAP documentation sources
- **sap_docs_get** – fetches full documents/snippets with smart formatting
- **sap_community_search** – real-time SAP Community posts with **full content** of top 3 results
- **sap_help_search** – comprehensive search across all SAP Help Portal documentation  
- **sap_help_get** – retrieves complete SAP Help pages with metadata

---

## Connect from your MCP client

✅ **Remote URL**: use the public SSE endpoint or Streamable HTTP endpoint
✅ **Local/STDIO**: run `node dist/src/server.js` and point the client to a command + args  
✅ **Local/Streamable HTTP**: run `npm run start:streamable` and point the client to `http://127.0.0.1:3122/mcp`

Below are copy-paste setups for popular clients. Each block has remote, local, and streamable HTTP options.

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

Claude's [user quickstart](https://modelcontextprotocol.io/docs/tutorials/use-remote-mcp-server) shows how to add local servers by specifying a command/args pair.

</details>

<details>
<summary><b>Local (Streamable HTTP) — latest MCP protocol</b></summary>

For the latest MCP protocol (2025-03-26) with Streamable HTTP support:

1. Start the streamable HTTP server:
```bash
npm run start:streamable
```

2. Add a custom connector with the URL:
```
http://127.0.0.1:3122/mcp
```

This provides better performance and supports the latest MCP features including session management and resumability.

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
You can add by command (local/STDIO), by URL (remote HTTP/SSE), or by local Streamable HTTP using the built-in wizard.
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

**Local (Streamable HTTP)** - latest MCP protocol:
```
http://127.0.0.1:3122/mcp
```
(Start with `npm run start:streamable` first)

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

## Raycast

<details>
<summary><b>Remote (SSE URL)</b></summary>

Open Raycast → Open Command "Manage Servers (MCP) → Import following JSON

```json
{
  "mcpServers": {
    "sap-docs": {
      "command": "npx",
      "args": ["mcp-remote@latest", "https://mcp-sap-docs.marianzeis.de/sse"]
    }
  }
}
```

</details>

<details>
<summary><b>Local (STDIO)</b></summary>

Open Raycast → Open Command "Manage Servers (MCP) → Import following JSON

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

</details>

Raycast by default asks to confirm each usage of an MCP tool. You can enable automatic confirmation:

Open Raycast → Raycast Settings → AI → Model Context Protocol → Check "Automatically confirm all tool calls"

---

## Features

### 🔍 Comprehensive Search System
- **sap_docs_search**: Search official SAP documentation, APIs, sample code, and wdi5 docs
- **sap_community_search**: Search real-time SAP Community content with **automatic full content retrieval** of top 3 posts
- **sap_help_search**: Search SAP Help Portal using private APIs for all SAP product documentation across S/4HANA, BTP, Analytics Cloud, and more

### 📚 Comprehensive Coverage
- **1,485+ SAPUI5 files** - Complete developer guide
- **195+ CAP files** - Cloud Application Programming model  
- **500+ OpenUI5 APIs** - Control APIs with detailed JSDoc
- **2,000+ sample files** - Working examples from `demokit/sample` directories
- **wdi5 E2E test framework docs** - End-to-end testing documentation
- **Real-time community content** - Live posts with engagement filtering
- **UI5 Tooling docs** - UI5 Tooling documentation
- **Cloud MTA Build Tool docs** - Cloud MTA Build Tool Documentation
- **UI5 Web Components docs** - UI5 Web Components documentation
- **SAP Cloud SDK** - SAP Cloud SDK documentation (Javascript & Java)
- **SAP Cloud SDK for AI** - SAP Cloud SDK for AI documentation (Javascript & Java)

### 🌐 SAP Community Integration
- **Intelligent Search**: HTML scraping using SAP Community's "Best Match" algorithm
- **Full Content Delivery**: Automatic retrieval of complete blog post content for top 3 results
- **Quality Filtering**: Only posts with kudos > 5 for high-quality content
- **Efficient API Usage**: Batch content retrieval using LiQL API for fast response times
- **Real-world Knowledge**: Live posts with practical developer insights and solutions

### 🏢 SAP Help Portal Integration  
- **Comprehensive Coverage**: Search across all SAP product documentation
- **Private API Access**: Direct integration with help.sap.com internal APIs
- **Full Content Retrieval**: Complete documentation pages with metadata
- **Product Scope**: S/4HANA, SAP BTP, Analytics Cloud, Fiori, ABAP, and more

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
- **UI5 Tooling Documentation** (`/ui5-tooling`) - UI5 Tooling documentation
- **Cloud MTA Build Tool Documentation** (`/cloud-mta-build-tool`) - Cloud MTA Build Tool documentation
- **UI5 Web Components Documentation** (`/ui5-webcomponents`) - UI5 Web Components documentation

### Community Content (Full Content Included)
- **Complete Blog Posts** - Full technical tutorials and deep-dives with complete content
- **Real-world Solutions** - Comprehensive answers to development problems with full context
- **Best Practices** - Community-tested approaches with detailed explanations
- **Code Examples** - Complete implementations with full source code and explanations
- **Quality Assurance** - Only posts with kudos > 5, automatically ranked by relevance
- **Instant Access** - Top 3 results include full post content (no additional API calls needed)

### SAP Help Portal Content
- **Product Documentation** - Complete guides for S/4HANA, BTP, Analytics Cloud
- **Implementation Guides** - Step-by-step setup and configuration documentation
- **Technical References** - API documentation, development guides, and technical specs
- **Troubleshooting** - Comprehensive problem-solving documentation
- **Release Notes** - Latest updates and changes across SAP products

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

### Search SAP Community (with Full Content)
```
Use sap_community_search with: "wdi5 best practices"
```
**Returns**: Top 3 most relevant community posts about wdi5 best practices **with complete blog post content included** - no need for additional API calls.

### Search SAP Help Portal
```
Use sap_help_search with: "S/4HANA Fiori configuration"
```
**Returns**: Comprehensive SAP Help documentation about S/4HANA and Fiori configuration from help.sap.com.

### Get SAP Help Content
```
Use sap_help_get with: sap-help-12345abc
```
**Returns**: Complete SAP Help page with full content and metadata.

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

**Official Documentation:**
- "How do I implement authentication in SAPUI5?"
- "Show me wdi5 testing examples for forms"
- "Find OpenUI5 button control examples with click handlers"

**Community Knowledge (with full content):**
- "What are the latest CAP authentication best practices from the community?"
- "Find community examples of OData batch operations with complete implementation"
- "Search for temporal data handling in CAP with real-world solutions"

**SAP Help Portal:**
- "How to configure S/4HANA Fiori Launchpad?"
- "Find BTP integration documentation for Analytics Cloud"
- "Search for ABAP development best practices in S/4HANA"

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

- Microsoft's ["Add an MCP server"](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) guide shows both URL and command flows.

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
npm run test:community # Test community search functionality
```

### Server Commands
```bash
npm start                  # Start STDIO MCP server
npm run start:http         # Start HTTP status server (port 3001)
npm run start:streamable   # Start Streamable HTTP MCP server (port 3122)
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

- **MCP Server** (Node.js/TypeScript) - Exposes Resources/Tools for SAP docs, community & help portal
- **Streamable HTTP Transport** (Latest MCP spec 2025-03-26) - HTTP-based transport with session management and resumability
- **SSE Proxy** (Python) - Bridges STDIO → URL for remote clients  
- **BM25 Search Engine** - SQLite FTS5 with optimized OR-logic queries for fast, relevant results

### Search Implementation

The server uses a **BM25-only approach** for optimal performance:

- **SQLite FTS5** - Full-text search with prefix matching and OR logic
- **Query Processing** - Automatic stopword filtering and phrase detection  
- **Fast Response Times** - ~15ms average query time
- **High Recall** - OR logic ensures comprehensive results
- **Lightweight** - No external dependencies or ML models required
