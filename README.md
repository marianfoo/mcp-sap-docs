# SAP Documentation MCP Server

A comprehensive Model Context Protocol (MCP) server providing **offline access to SAP documentation AND real-time SAP Community content**. This server integrates official documentation with community-driven solutions, giving developers access to both authoritative documentation and practical, real-world insights from the SAP Community.

## Features

- **🔍 Dual Search System**: 
  - `sap_docs_search`: Search official SAP documentation, APIs, sample code, and wdi5 docs
  - `sap_community_search`: Search real-time SAP Community content
- **📚 Comprehensive Coverage**: 1,485+ SAPUI5 files, 195+ CAP files, 500+ OpenUI5 APIs, 2,000+ sample files, **wdi5 E2E test framework docs**, PLUS real-time community content
- **🌐 SAP Community Integration**: Dedicated tool for searching high-quality community blog posts, solutions, and discussions
- **💡 Smart Formatting**: Automatic code highlighting, sample categorization, and content formatting
- **🔄 Live Content**: Community posts are fetched in real-time with engagement filtering (kudos > 5)
- **🎯 Source-Specific Results**: Choose between official documentation or community experiences based on your needs

## What's Included

### Official Documentation
- **SAPUI5 Documentation**: Complete developer guide with 1,485+ files
- **CAP Documentation**: Cloud Application Programming model with 195+ files  
- **OpenUI5 API Documentation**: 500+ control APIs with detailed JSDoc
- **OpenUI5 Sample Code**: 2,000+ working examples from `demokit/sample` directories
- **wdi5 Documentation**: End-to-end test framework docs from [wdi5](https://github.com/ui5-community/wdi5) (`/wdi5`)

### Community Content
- **Blog Posts**: Technical tutorials and deep-dives from SAP Community
- **Solutions**: Real-world answers to common development problems
- **Best Practices**: Community-tested approaches and patterns
- **Code Examples**: Practical implementations shared by developers
- **High-Quality Filter**: Only posts with kudos > 5 for quality assurance

## Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd sap-docs-mcp
   npm install
   ```

2. **Download and prepare documentation sources:**
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

3. **Build the search index:**
   ```bash
   npm run build:index
   ```

4. **Build the server:**
   ```bash
   npm run build
   ```

## Configuration

Add to your Cursor `settings.json`:

```json
{
  "mcpServers": {
    "sap-docs": {
      "command": "node",
      "args": ["/path/to/sap-docs-mcp/dist/index.js"]
    }
  }
}
```

## Available Libraries

1. **`/sapui5`** - SAPUI5 Developer Documentation (1,485 files)
2. **`/cap`** - CAP Documentation (195 files)  
3. **`/openui5-api`** - OpenUI5 Control APIs (500+ controls)
4. **`/openui5-samples`** - OpenUI5 Sample Code (2,000+ examples)
5. **`/wdi5`** - wdi5 End-to-End Test Framework Documentation
6. **`/community`** - SAP Community Posts (real-time)

## Usage Examples

### Search Official Documentation
```
Use sap_docs_search with: "wdi5 configuration"
```
**Returns**: wdi5 documentation about configuration, setup, and usage.

### Get wdi5 Documentation
```
Use sap_docs_get with: /wdi5
```
**Returns**: wdi5 documentation overview

### Search for wdi5 Topics
```
Use sap_docs_search with: "wdi5 cli"
```
**Returns**: wdi5 CLI documentation and related guides

### Search SAP Community
```
Use sap_community_search with: "wdi5 best practices"
```
**Returns**: Recent community posts, blog articles, and discussions about wdi5 best practices.

### Get Specific Documentation
```
Use sap_docs_get with: /sapui5
```
**Returns**: SAPUI5 documentation overview

### Get Community Insights
```
Use sap_docs_get with: community-12345
```
**Returns**: Full content of a specific community post with metadata

### Find Sample Implementations
```
Use sap_docs_search with: "button click handler"
```
**Returns**: 
- Official button documentation
- Sample button implementations with JS controllers
- XML view examples

## Test Cases

### 1. Official Documentation Search
**Tool**: `sap_docs_search`
**Query**: "wdi5"
**Expected Results**:
- wdi5 documentation overview
- wdi5 guides and API references
- wdi5 usage and configuration examples

### 2. Community Content Search
**Tool**: `sap_community_search`
**Query**: "wdi5"
**Expected Results**:
- Community blog posts about wdi5
- Real developer solutions and code examples
- Discussion threads about wdi5 best practices

### 3. Sample Code Discovery
**Tool**: `sap_docs_search`
**Query**: "data binding"
**Expected Results**:
- Official data binding documentation
- Working sample code with models and binding
- Practical examples from sample implementations

### 4. Community Best Practices
**Tool**: `sap_community_search`
**Query**: "authentication best practices"
**Expected Results**:
- Community blog posts about auth implementation
- Real developer solutions and code examples
- Discussion threads about common auth issues

## Project Statistics

- **Total Files**: 4,180+ documentation files + real-time community content
- **SAPUI5 Docs**: 1,485 markdown files
- **CAP Docs**: 195 markdown files  
- **OpenUI5 APIs**: 500+ JavaScript control definitions
- **Sample Code**: 2,000+ implementation examples
- **Community Posts**: Real-time access to filtered, high-quality content
- **Total Search Index**: Dynamic, combining offline docs with live community data

## Community Integration Details

The SAP Community integration uses the official SAP Community API to fetch:
- **Blog posts** from SAPUI5 and CAP product areas
- **High-engagement content** (posts with kudos > 5)
- **Recent discussions** ordered by post time
- **Full post content** including code examples and solutions

Community content is fetched in real-time, ensuring you always get the latest insights and solutions from the SAP developer community.

## Architecture

This MCP server uses **Resources** instead of Tools, allowing Cursor to:
- Browse available documentation libraries
- Search across all content types simultaneously  
- Access specific documents and community posts
- Get real-time community insights alongside official docs
- Retrieve sample code with proper formatting and context

The server intelligently combines offline documentation with live community content, providing a comprehensive knowledge base for SAP development.

## Development

- **Build**: `npm run build`
- **Build Index**: `npm run build:index`  
- **Type Check**: `npm run type-check`

The build process creates optimized search indices for fast offline access while maintaining real-time connectivity to the SAP Community API for the latest community content.

---

*This MCP server bridges the gap between official SAP documentation, wdi5 E2E test framework docs, and real-world developer knowledge, providing comprehensive support for SAP development with both authoritative sources and community wisdom.* 
