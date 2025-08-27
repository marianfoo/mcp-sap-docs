# Remote Server Setup Guide

This guide explains how to connect to the hosted SAP Documentation MCP Server for instant access to SAP documentation and community content without local setup.

## 🚀 Quick Setup (2 minutes)

### Step 1: Locate Your MCP Configuration File

The MCP configuration file location depends on your operating system:

| OS | Location |
|---|---|
| **macOS** | `~/.cursor/mcp.json` |
| **Linux** | `~/.cursor/mcp.json` |
| **Windows** | `%APPDATA%\Cursor\mcp.json` |

### Step 2: Create or Edit the Configuration File

If the file doesn't exist, create it. If it exists, add the new server to the existing configuration.

#### New Configuration File
```json
{
  "mcpServers": {
    "sap-docs-remote": {
      "url": "https://mcp-sap-docs.marianzeis.de/sse"
    }
  }
}
```

#### Adding to Existing Configuration
If you already have other MCP servers configured, add the new server:

```json
{
  "mcpServers": {
    "existing-server": {
      "command": "some-command"
    },
    "sap-docs-remote": {
      "url": "https://mcp-sap-docs.marianzeis.de/sse"
    }
  }
}
```

### Step 3: Restart Cursor

Close and reopen Cursor to load the new MCP server configuration.

### Step 4: Test the Connection

Ask Cursor a SAP-related question to verify the connection:

- "How do I implement authentication in SAPUI5?"
- "Show me wdi5 testing examples"
- "What are CAP service best practices?"

## 🎯 What You Get

### Comprehensive Documentation Access
- **SAPUI5 Documentation**: 1,485+ files with complete developer guides
- **CAP Documentation**: 195+ files covering Cloud Application Programming
- **OpenUI5 API Documentation**: 500+ control APIs with detailed JSDoc
- **OpenUI5 Sample Code**: 2,000+ working examples
- **wdi5 Documentation**: End-to-end test framework docs

### Real-Time Community Content
- **SAP Community Posts**: Latest blog posts and solutions
- **High-Quality Content**: Engagement info (kudos) included when available; results follow SAP Community's Best Match ranking
- **Code Examples**: Real-world implementations from developers
- **Best Practices**: Community-tested approaches

## 🔧 Troubleshooting

### Server Not Responding
1. Check your internet connection
2. Verify the URL is correct: `https://mcp-sap-docs.marianzeis.de/sse`
3. Restart Cursor
4. Check Cursor's MCP server status in settings

### Configuration Not Loading
1. Verify the JSON syntax is correct (use a JSON validator)
2. Ensure the file path is correct for your OS
3. Check file permissions (should be readable by your user)
4. Restart Cursor after any configuration changes

### No SAP Documentation in Responses
1. Try asking more specific SAP-related questions
2. Include keywords like "SAPUI5", "CAP", "wdi5", or "SAP Community"
3. Check if other MCP servers might be taking precedence

## 💡 Usage Tips

### Effective Prompts
Instead of generic questions, use specific SAP terminology:

✅ **Good:**
- "How do I implement SAPUI5 data binding with OData models?"
- "Show me wdi5 test examples for table interactions"
- "What are CAP service annotations for authorization?"

❌ **Less Effective:**
- "How do I bind data?"
- "Show me test examples"
- "What are service annotations?"

### Combining Local and Remote
You can use both local and remote MCP servers simultaneously:

```json
{
  "mcpServers": {
    "sap-docs-local": {
      "command": "node",
      "args": ["/path/to/local/server.js"]
    },
    "sap-docs-remote": {
      "url": "https://mcp-sap-docs.marianzeis.de/sse"
    }
  }
}
```

## 🌐 Server Information

- **URL**: https://mcp-sap-docs.marianzeis.de
- **Health Check**: https://mcp-sap-docs.marianzeis.de/status
- **Protocol**: Server-Sent Events (SSE)
- **Uptime**: Monitored 24/7 with automatic deployment
- **Updates**: Automatically synced with latest documentation
- **Environment**: Uses PM2 for process management (no Docker)

## 🖥️ Local Development

### VS Code Performance Optimization
The large documentation submodules are excluded from VS Code operations to prevent crashes:

- **Search Excluded**: `sources/`, `node_modules/`, `dist/`, `data/`
- **File Explorer Hidden**: Large submodule folders are hidden
- **Git Operations**: Submodules are excluded from local git tracking

### Local Setup
For local development without the large submodules:

```bash
# Quick setup (excludes large submodules)
npm run setup

# Or manually initialize submodules
npm run setup:submodules
```

## 📞 Support

If you encounter issues:

1. Check the [repository issues](https://github.com/marianfoo/mcp-sap-docs/issues)
2. Verify server status at the health check URL
3. Create a new issue with your configuration and error details

---

*The remote server provides the same comprehensive SAP documentation access as the local installation but with zero setup complexity and automatic updates.*