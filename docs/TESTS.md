# 🧪 Testing Guide

## Test Architecture

### 📁 **Test Structure**
```
test/
├── tools/
│   ├── run-tests.js              # Main test runner
│   ├── search.smoke.js           # Quick validation tests
│   └── sap_docs_search/          # Search test cases
│       ├── search-cap-docs.js    # CAP documentation tests
│       ├── search-cloud-sdk-js.js # Cloud SDK tests
│       └── search-sapui5-docs.js # UI5 documentation tests
├── _utils/
│   ├── httpClient.js             # HTTP server utilities
│   └── parseResults.js           # Output format validation
└── performance/
    └── README.md                 # Performance testing guide
```

## Test Commands

### 🚀 **Quick Testing**
```bash
npm run test:smoke      # Fast validation (30 seconds)
npm run test:fast       # Skip build, test only (2 minutes)
npm run test            # Full build + test (5 minutes)
npm run test:community  # SAP Community functionality (1 minute)
npm run inspect         # MCP protocol inspector (interactive)
```

### 🎯 **Specific Tests**
```bash
# Run specific test file
node test/tools/run-tests.js --spec search-cap-docs

# Run with custom server
node test/tools/run-tests.js --port 3002
```

## Expected Output Format

### 📊 **BM25-Only Results**
```
⭐️ **<document-id>** (Score: <final-score>)
   <description-preview>
   Use in sap_docs_get
```

**Example:**
```
⭐️ **/cap/cds/cdl#enums** (Score: 95.42)
   Use enums to define a fixed set of values for an element...
   Use in sap_docs_get
```

### 🎨 **Context Indicators**
- **🎨 UI5 Context**: Frontend, controls, Fiori
- **🏗️ CAP Context**: Backend, CDS, services
- **🧪 wdi5 Context**: Testing, automation
- **🔀 MIXED Context**: Cross-platform queries

### 📈 **Result Summary**
```
Found X results for 'query' 🎨 **UI5 Context**:

🔹 **UI5 API Documentation:**
⭐️ **sap.m.Wizard** (Score: 100.00)
   ...

💡 **Context**: UI5 query detected. Scores reflect relevance to this context.
```

## Test Data Structure

### 🧪 **Test Case Format**
```javascript
export default [
  {
    name: 'Test Name',
    tool: 'sap_docs_search',
    query: 'search term',
    expectIncludes: ['/expected/document/id'],
    validate: (results) => {
      // Custom validation logic
      return results.some(r => r.includes('expected content'));
    }
  }
];
```

### 📋 **Test Categories**

#### **CAP Tests** (`search-cap-docs.js`)
- CDS entities and services
- Annotations and aspects
- Query language features
- Database integration

#### **UI5 Tests** (`search-sapui5-docs.js`)
- UI5 controls and APIs
- Fiori elements
- Data binding and routing
- Chart and visualization components

#### **Cloud SDK Tests** (`search-cloud-sdk-js.js`)
- SDK getting started guides
- API documentation
- Upgrade and migration guides
- Error handling patterns

## Output Validation

### 🔍 **Parser Logic** (`parseResults.js`)
```javascript
// Expected line format
const lineRe = /^⭐️ \*\*(.+?)\*\* \(Score: ([\d.]+)\)/;

// Parsed result structure
{
  id: '/document/path',
  finalScore: 95.42,
  rerankerScore: 0  // Always 0 in BM25-only mode
}
```

### ✅ **Validation Rules**
1. **Score Format**: Must be numeric with 2 decimal places
2. **Document ID**: Must start with `/` and contain valid path
3. **Result Count**: Must respect `RETURN_K` limit (default: 25)
4. **Context Detection**: Must include appropriate emoji indicator
5. **Source Attribution**: Must group results by library type

## Test Execution Flow

### 🔄 **Test Runner Process**
1. **Server Startup**: Launch HTTP server on test port
2. **Health Check**: Verify server responds to `/status`
3. **Test Execution**: Run each test case sequentially
4. **Result Validation**: Parse and validate output format
5. **Server Cleanup**: Gracefully shut down test server

### 📊 **HTTP Client Utilities**
```javascript
// Server management
startServerHttp(port)     // Launch server
waitForStatus(port)       // Wait for ready state
stopServer(childProcess)  // Clean shutdown

// Search operations
docsSearch(query, port)   // Execute search query
parseResults(response)    // Parse formatted output
```

## Performance Testing

### ⏱️ **Response Time Expectations**
- **Simple Queries**: < 100ms (after warm-up)
- **Complex Queries**: < 500ms
- **First Query**: May take longer (index loading)
- **Subsequent Queries**: Should be consistently fast

### 📈 **Performance Metrics**
```javascript
// Timing measurement
const start = Date.now();
const results = await docsSearch(query);
const duration = Date.now() - start;

// Validation
assert(duration < 1000, `Query too slow: ${duration}ms`);
```

## Smoke Tests

### 🚀 **Quick Validation** (`search.smoke.js`)
```javascript
const SMOKE_QUERIES = [
  { q: 'wizard', expect: /wizard|Wizard/i },
  { q: 'CAP entity', expect: /entity|Entity/i },
  { q: 'wdi5 testing', expect: /test|Test/i }
];
```

### ✅ **Smoke Test Assertions**
1. **Results Found**: Each query returns at least one result
2. **Expected Content**: Results contain expected keywords
3. **BM25 Mode**: All reranker scores are 0
4. **Format Compliance**: Output matches expected format
5. **Server Health**: All endpoints respond correctly

## Test Debugging

### 🔍 **Debug Failed Tests**
```bash
# Run single test with verbose output
DEBUG=1 node test/tools/run-tests.js --spec search-cap-docs

# Check server logs
tail -f logs/test-server.log

# Validate specific query
curl -X POST http://localhost:43122/mcp \
  -H "Content-Type: application/json" \
  -d '{"role": "user", "content": "failing query"}'
```

### 📊 **Common Test Failures**

#### **No Results Found**
- Check if search database exists: `ls -la dist/data/docs.sqlite`
- Verify index content: `sqlite3 dist/data/docs.sqlite "SELECT COUNT(*) FROM docs;"`
- Rebuild search artifacts: `npm run build:all`

#### **Wrong Output Format**
- Update parser regex in `parseResults.js`
- Check for extra whitespace or formatting changes
- Validate against expected format examples

#### **Server Connection Issues**
- Kill existing processes: `lsof -ti:43122 | xargs kill -9`
- Check port availability: `lsof -i :43122`
- Verify server startup logs

#### **Context Detection Failures**
- Review query expansion in `src/lib/metadata.ts`
- Check context boost configuration in `src/metadata.json`
- Validate context detection logic in `src/lib/localDocs.ts`

## Test Maintenance

### 🔄 **Updating Tests**
1. **New Sources**: Add test cases for new documentation sources
2. **Query Changes**: Update expected results when search logic changes
3. **Format Updates**: Modify parser when output format evolves
4. **Performance**: Adjust timing expectations based on system changes

### 📝 **Test Documentation**
1. **Document Changes**: Update test descriptions when modifying logic
2. **Expected Results**: Keep expectIncludes arrays current
3. **Validation Logic**: Comment complex validation functions
4. **Performance Baselines**: Document expected response times

### 🎯 **Best Practices**
1. **Specific Queries**: Use precise search terms for reliable results
2. **Stable Expectations**: Test against content unlikely to change
3. **Error Handling**: Include tests for edge cases and failures
4. **Performance Monitoring**: Track response time trends over time

## Integration with CI/CD

### 🚀 **GitHub Actions Integration**
```yaml
- name: Run tests
  run: npm run test
  
- name: Validate smoke tests
  run: npm run test:smoke
```

### 📊 **Test Reporting**
- **Exit Codes**: 0 for success, non-zero for failures
- **Console Output**: Structured test results with timing
- **Error Details**: Specific failure information for debugging
- **Summary Statistics**: Pass/fail counts and performance metrics
