# SAP Documentation MCP Server

A fast, lightweight MCP server that provides unified access to official SAP documentation (SAPUI5, CAP, OpenUI5 APIs & samples, wdi5) using efficient BM25 full-text search.
Use it remotely (hosted URL) or run it locally and point your client to STDIO.

**Public server STDIO**: https://mcp-sap-docs.marianzeis.de/sse  
**Public server Streamable HTTP**: https://mcp-sap-docs.marianzeis.de/mcp
**Streamable HTTP (default: 3122, configurable via MCP_PORT)**: http://127.0.0.1:3122/mcp  
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
- **sap_docs_search** – **unified search** across all SAP documentation sources including **42,901+ ABAP files across 8 versions** with intelligent version auto-detection (e.g., "LOOP 7.57" searches ABAP 7.57, "SELECT latest" searches latest ABAP)
- **sap_docs_get** – fetches complete documents/snippets with smart formatting for all sources including ABAP
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


</details>

---

## Eclipse (GitHub Copilot)

Eclipse users can integrate the SAP Docs MCP server with GitHub Copilot for seamless access to SAP development documentation.

> ⚠️ **Important Limitation**: GitHub Copilot currently does **not support** Eclipse ADT (ABAP Development Tools) due to the `semanticfs` URI scheme used for ABAP development. This affects ABAP-specific features when working directly with SAP systems in Eclipse ADT. See [GitHub Issue #171406](https://github.com/orgs/community/discussions/171406) for details.
> 
> **Workaround**: For ABAP development with Copilot, use VS Code with ABAP Remote File System instead, where this functionality works as expected.

<details>
<summary><b>Remote (recommended) — hosted server</b></summary>

### Prerequisites
- **Eclipse Version**: 2024-09 or higher
- **GitHub Copilot Extension**: Latest version from Eclipse Marketplace
- **GitHub Account**: With Copilot access
- **Note**: Full ABAP ADT integration is not yet supported

### Configuration Steps

1. **Install GitHub Copilot Extension**
   - Download from [Eclipse Marketplace](https://marketplace.eclipse.org/content/github-copilot)
   - Follow the installation instructions

2. **Open MCP Configuration**
   - Click the Copilot icon (🤖) in the Eclipse status bar  
   - Select "Edit preferences" from the menu
   - Expand "Copilot Chat" in the left panel
   - Click on "MCP"

3. **Add SAP Docs MCP Server**
   ```json
   {
     "name": "SAP Docs MCP",
     "description": "Comprehensive SAP development documentation with ABAP keyword documentation",
     "url": "https://mcp-sap-docs.marianzeis.de/sse"
   }
   ```

4. **Verify Configuration**
   - The server should appear in your MCP servers list
   - Status should show as "Connected" when active

### Using SAP Docs in Eclipse

Once configured, you can use Copilot Chat in Eclipse with enhanced SAP documentation:

**Example queries:**
```
How do I implement a Wizard control in UI5?
What is the syntax for inline declarations in ABAP 7.58?
Show me best practices for RAP development
Find wdi5 testing examples for OData services
```

**Available Tools:**
- `sap_docs_search` - General SAP development (UI5, CAP, testing)
- `abap_search` - **Individual ABAP files** optimized for LLM consumption
- `abap_get` - Retrieve focused ABAP documentation
- `sap_community_search` - SAP Community integration
- `sap_help_search` - SAP Help Portal access

</details>

<details>
<summary><b>Local setup — for offline use</b></summary>

### Local MCP Server Configuration

```json
{
  "name": "SAP Docs MCP (Local)",
  "description": "Local SAP documentation server",
  "command": "npm", 
  "args": ["start"],
  "cwd": "/absolute/path/to/your/sap-docs-mcp",
  "env": {
    "NODE_ENV": "production"
  }
}
```

**Prerequisites for local setup:**
1. Clone and build this repository locally
2. Run `npm run setup` to initialize all documentation sources
3. Ensure the server starts correctly with `npm start`

</details>

---

## VS Code (GitHub Copilot Chat)

<details>
<summary><b>Remote (recommended) — no setup required</b></summary>

**Prerequisites**: VS Code 1.102+ with MCP support enabled (enabled by default).

### Quick Setup
Create `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "sap-docs": {
      "type": "http",
      "url": "https://mcp-sap-docs.marianzeis.de/mcp"
    }
  }
}
```

**Alternative (SSE)**: Use `"type": "sse"` with `"url": "https://mcp-sap-docs.marianzeis.de/sse"` if HTTP doesn't work.

### Using the Remote Server
1. Save the `.vscode/mcp.json` file in your workspace
2. VS Code will automatically detect and start the MCP server
3. Open Chat view and select **Agent mode**
4. Click **Tools** button to see available SAP documentation tools
5. Ask questions like "How do I implement authentication in SAPUI5?"

**Benefits**: 
- ✅ No local installation required
- ✅ Always up-to-date documentation  
- ✅ Automatic updates and maintenance
- ✅ Works across all your projects

**Note**: You'll be prompted to trust the remote MCP server when connecting for the first time.

</details>

<details>
<summary><b>Local setup — for offline use</b></summary>

### Local STDIO Server
```json
{
  "servers": {
    "sap-docs-local": {
      "type": "stdio",
      "command": "node",
      "args": ["<absolute-path>/dist/src/server.js"]
    }
  }
}
```

### Local HTTP Server
```json
{
  "servers": {
    "sap-docs-http": {
      "type": "http", 
      "url": "http://127.0.0.1:3122/mcp"
    }
  }
}
```
(Start local server with `npm run start:streamable` first)

### Alternative Setup Methods
- **Command Palette**: Run `MCP: Add Server` → choose server type → provide details → select scope
- **User Configuration**: Run `MCP: Open User Configuration` for global setup across all workspaces

See Microsoft's ["Use MCP servers in VS Code"](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) for complete documentation.

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
- **sap_docs_search**: **Unified search** across all SAP documentation including **42,901+ ABAP files across 8 versions** (7.52-7.58 + latest) with automatic version detection from queries
- **sap_community_search**: Search real-time SAP Community content with **automatic full content retrieval** of top 3 posts
- **sap_help_search**: Search SAP Help Portal using private APIs for all SAP product documentation across S/4HANA, BTP, Analytics Cloud, and more

### 📚 Comprehensive Coverage
- **1,485+ SAPUI5 files** - Complete developer guide
- **195+ CAP files** - Cloud Application Programming model  
- **500+ OpenUI5 APIs** - Control APIs with detailed JSDoc
- **2,000+ sample files** - Working examples from `demokit/sample` directories
- **42,901+ ABAP individual files** - Official SAP ABAP keyword documentation across 8 versions (7.52, 7.53, 7.54, 7.55, 7.56, 7.57, 7.58, latest) with intelligent version auto-detection
- **wdi5 E2E test framework docs** - End-to-end testing documentation
- **UI5 TypeScript documentation** - Official TypeScript integration guides and type definitions
- **ABAP best practices** - Clean ABAP guidelines, cheat sheets, and German community guidelines (DSAG)
- **Fiori Elements showcases** - Comprehensive annotation references for both ABAP RAP and CAP
- **Real-time community content** - Live posts with engagement info
- **UI5 Tooling docs** - UI5 Tooling documentation
- **Cloud MTA Build Tool docs** - Cloud MTA Build Tool Documentation
- **UI5 Web Components docs** - UI5 Web Components documentation
- **UI5 Custom Controls** - Spreadsheet importer and other custom control documentation
- **SAP Cloud SDK** - SAP Cloud SDK documentation (Javascript & Java)
- **SAP Cloud SDK for AI** - SAP Cloud SDK for AI documentation (Javascript & Java)

### 🌐 SAP Community Integration
- **Intelligent Search**: HTML scraping using SAP Community's "Best Match" algorithm
- **Full Content Delivery**: Automatic retrieval of complete blog post content for top 3 results
- **Engagement Info**: Includes kudos count when available (no hard kudos filtering)
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
- **Engagement Info** - Displays kudos when available; results follow Best Match ranking
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
- "What is Clean ABAP and how do I follow the style guide?"
- "Show me TypeScript setup for UI5 development"

**ABAP Keyword Documentation (Enhanced):**
- "What is the syntax for inline declarations in ABAP 7.58?"
- "How do I use SELECT statements with internal tables?"
- "Show me exception handling with TRY-CATCH in ABAP"
- "What are the differences between LOOP and WHILE in ABAP?"
- "How do I define classes and methods in ABAP OOP?"

**Community Knowledge (with full content):**
- "What are the latest CAP authentication best practices from the community?"
- "Find community examples of OData batch operations with complete implementation"
- "Search for temporal data handling in CAP with real-world solutions"
- "Find RAP development tips and tricks from the community"

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
npm run build:tsc       # Compile TypeScript
npm run build:index     # Build search index from sources
npm run build:fts       # Build FTS5 database  
npm run build           # Complete build pipeline (tsc + index + fts)
npm run setup           # Complete setup (submodules + build)
```

### Server Commands
```bash
npm start                    # Start STDIO MCP server
npm run start:http           # Start HTTP status server (port 3001)
npm run start:streamable     # Start Streamable HTTP MCP server (port 3122)
```

### Local Setup  
```bash
git clone https://github.com/marianfoo/mcp-sap-docs.git
cd mcp-sap-docs
npm ci               # Install dependencies
npm run setup        # Enhanced setup (optimized submodules + complete build)
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

1. **Main Deployment** (on push to `main` or manual trigger)
   - SSH into server and pull latest code
   - Run enhanced setup with optimized submodule handling
   - Restart all PM2 processes (proxy, http, streamable) with health checks

2. **Daily Documentation Updates** (4 AM UTC)
   - Update all documentation submodules to latest versions
   - Rebuild search indices with fresh content using enhanced setup
   - Restart services automatically

### Manual Updates
Trigger documentation updates anytime via GitHub Actions → "Update Documentation Submodules" workflow.

---

## Architecture

- **MCP Server** (Node.js/TypeScript) - Exposes Resources/Tools for SAP docs, community & help portal
- **Streamable HTTP Transport** (Latest MCP spec) - HTTP-based transport with session management and resumability
- **SSE Proxy** (Python) - Bridges STDIO → URL for remote clients  
- **BM25 Search Engine** - SQLite FTS5 with optimized OR-logic queries for fast, relevant results
- **Optimized Submodules** - Shallow, single-branch clones with blob filtering for minimal bandwidth

### Search Implementation

The server uses a **BM25-only approach** for optimal performance:

- **SQLite FTS5** - Full-text search with prefix matching and OR logic
- **Query Processing** - Automatic stopword filtering and phrase detection  
- **Fast Response Times** - ~15ms average query time
- **High Recall** - OR logic ensures comprehensive results
- **Lightweight** - No external dependencies or ML models required
