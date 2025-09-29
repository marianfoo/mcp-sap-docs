# 🛠️ Development Guide

## Quick Start

### 🚀 **Initial Setup**
```bash
# Clone and install
git clone <repo-url>
cd sap-docs-mcp
npm install

# Run enhanced setup (submodules + build)
npm run setup

# Start development server
npm run start:http
```

### 🧪 **Run Tests**
```bash
npm run test:smoke    # Quick validation
npm run test:fast     # Skip build, test only
npm run test          # Full build + test
```

## Common Commands

### 📦 **Build Commands**
```bash
npm run build:tsc       # Compile TypeScript
npm run build:index     # Build documentation index
npm run build:fts       # Build FTS5 search database  
npm run build           # Complete build pipeline (tsc + index + fts)
```

### 🖥️ **Server Commands**
```bash
npm start                    # MCP stdio server (for Claude)
npm run start:http           # HTTP development server (port 3001)
npm run start:streamable     # Streamable HTTP server (port 3122)
```

### 🧪 **Test Commands**  
```bash
npm run test:smoke      # Quick smoke tests
npm run test:fast       # Test without rebuild
npm run test            # Full test suite
npm run test:community  # SAP Community search tests
npm run inspect         # MCP protocol inspector
```

## Environment Variables

### 🔧 **Core Configuration**
```bash
RETURN_K=25                    # Number of search results (default: 25)
LOG_LEVEL=INFO                 # Logging level (ERROR, WARN, INFO, DEBUG)
LOG_FORMAT=json                # Log format (json or text)
NODE_ENV=production            # Environment mode
```

### 🗄️ **Database & Paths**
```bash
DB_PATH=dist/data/docs.sqlite  # FTS5 database path
METADATA_PATH=src/metadata.json # Metadata configuration path
```

### 🌐 **Server Configuration**
```bash
PORT=3001                      # HTTP server port
MCP_PORT=3122                  # Streamable HTTP MCP port
```

## Development Servers

### 📡 **1. Stdio MCP Server** (Main)
```bash
npm run start:stdio
# For Claude/LLM integration via stdio transport
```

### 🌐 **2. HTTP Development Server**
```bash
npm run start:http
# Access: http://localhost:3001
# Endpoints: /status, /healthz, /readyz, /mcp
```

### 🔄 **3. Streamable HTTP Server**
```bash
npm run start:streamable  
# Access: http://localhost:3122
# Endpoints: /mcp, /health
```

## Where to Change Things

### 🔍 **Search Behavior**
- **Query Processing**: `src/lib/searchDb.ts` → `toMatchQuery()`
- **Search Logic**: `src/lib/search.ts` → `search()`
- **Result Formatting**: `src/lib/localDocs.ts` → `searchLibraries()`

### ⚙️ **Configuration**
- **Source Settings**: `src/metadata.json` → Add/modify sources
- **Core Config**: `src/lib/config.ts` → System settings
- **Metadata APIs**: `src/lib/metadata.ts` → Configuration access

### 🛠️ **MCP Tools**
- **Tool Definitions**: `src/server.ts` → `ListToolsRequestSchema`
- **Tool Handlers**: `src/server.ts` → `CallToolRequestSchema`
- **HTTP Endpoints**: `src/http-server.ts` → `/mcp` handler

### 🏗️ **Build Process**
- **Index Building**: `scripts/build-index.ts`
- **FTS Database**: `scripts/build-fts.ts`
- **Source Processing**: Modify build scripts for new source types

### 🧪 **Tests**
- **Test Cases**: `test/tools/search/` → Add new test files
- **Test Runner**: `test/tools/run-tests.js` → Modify test execution
- **Output Parsing**: `test/_utils/parseResults.js` → Update format expectations

### 🚀 **Deployment**
- **PM2 Config**: `ecosystem.config.cjs` → Process configuration
- **GitHub Actions**: `.github/workflows/deploy-mcp-sap-docs.yml`
- **Setup Script**: `setup.sh` → Deployment automation

## Adding New Documentation Sources

### 1. **Update Metadata** (`src/metadata.json`)
```json
{
  "id": "new-source",
  "type": "documentation",
  "libraryId": "/new-source",
  "sourcePath": "new-source/docs",
  "baseUrl": "https://example.com/docs",
  "pathPattern": "/{file}",
  "anchorStyle": "github",
  "boost": 0.05,
  "tags": ["new", "documentation"],
  "description": "New documentation source"
}
```

### 2. **Add Context Boosts** (if needed)
```json
"contextBoosts": {
  "New Context": {
    "/new-source": 1.0,
    "/other-source": 0.3
  }
}
```

### 3. **Add Library Mapping** (if needed)
```json
"libraryMappings": {
  "new-source-alias": "new-source"
}
```

### 4. **No Code Changes Required!**
The metadata APIs automatically handle the new source.

## Debugging

### 🔍 **Search Issues**
```bash
# Test specific queries
node -e "
import { search } from './dist/src/lib/search.js';
const results = await search('your query');
console.log(JSON.stringify(results, null, 2));
"

# Check FTS database
sqlite3 dist/data/docs.sqlite "SELECT * FROM docs WHERE docs MATCH 'your query' LIMIT 5;"
```

### 📊 **Metadata Issues**
```bash
# Test metadata loading
node -e "
import { loadMetadata, getSourceBoosts } from './dist/src/lib/metadata.js';
loadMetadata();
console.log('Boosts:', getSourceBoosts());
"
```

### 🌐 **Server Issues**
```bash
# Check server health
curl http://localhost:3001/status
curl http://localhost:3122/health

# Test search endpoint
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"role": "user", "content": "wizard"}'
```

## Performance Optimization

### ⚡ **Search Performance**
- **FTS5 Tuning**: Modify `scripts/build-fts.ts` for different indexing strategies
- **Query Optimization**: Adjust `toMatchQuery()` in `src/lib/searchDb.ts`
- **Result Limits**: Configure `RETURN_K` environment variable

### 💾 **Memory Usage**
- **Index Size**: Monitor `dist/data/` artifact sizes
- **Metadata Loading**: Lazy loading in `src/lib/metadata.ts`
- **Process Monitoring**: Use PM2 monitoring features

## Common Issues

### ❌ **Build Failures**
```bash
# Clean and rebuild
rm -rf dist/
npm run build:all
```

### ❌ **Search Returns No Results**
```bash
# Check if database exists
ls -la dist/data/docs.sqlite

# Verify index content
sqlite3 dist/data/docs.sqlite "SELECT COUNT(*) FROM docs;"
```

### ❌ **Metadata Loading Errors**
```bash
# Validate JSON syntax
node -e "JSON.parse(require('fs').readFileSync('src/metadata.json', 'utf8'))"

# Check file permissions
ls -la src/metadata.json
```

### ❌ **Server Won't Start**
```bash
# Check port availability
lsof -i :3001
lsof -i :3122

# Kill conflicting processes
lsof -ti:3001 | xargs kill -9
```

## Best Practices

### 📝 **Code Changes**
1. **Update Cursor Rules**: Modify `.cursor/rules/` when changing architecture
2. **Test First**: Run smoke tests before committing
3. **Metadata Over Code**: Use metadata.json for configuration changes
4. **Type Safety**: Use metadata APIs, never direct JSON access

### 🧪 **Testing**
1. **Smoke Tests**: Always run before deployment
2. **Integration Tests**: Test full MCP tool workflows
3. **Performance Tests**: Monitor search response times
4. **Output Validation**: Ensure format consistency

### 🚀 **Deployment**
1. **Build Validation**: Ensure all artifacts generated
2. **Health Checks**: Verify all endpoints after deployment
3. **Rollback Plan**: Keep previous artifacts for quick rollback
4. **Monitoring**: Watch logs and performance metrics

## Useful Development Tools

### 🔧 **VS Code Extensions**
- **REST Client**: Use `test-search.http` for API testing
- **SQLite Viewer**: Inspect FTS5 database content
- **JSON Schema**: Validate metadata.json structure

### 📊 **Monitoring**
```bash
# PM2 monitoring
pm2 monit

# Log streaming
pm2 logs mcp-sap-http --lines 100

# Process status
pm2 status
```
