# Test Suite

This directory contains test suites for the MCP SAP Documentation server.

## Test Structure

### Tool Tests (`test/tools/`)
Automated tests for MCP tools using a unified test harness:

- **`run-tests.js`**: Unified test runner that supports both running all tests and specific test files using `--spec` parameter
- **`sap_docs_search/`**: Test cases for the `sap_docs_search` tool organized by documentation source

#### Current Test Files:
- `search-cloud-sdk-js.js`: Tests for SAP Cloud SDK (JavaScript) documentation
- `search-cloud-sdk-ai.js`: Tests for SAP Cloud SDK for AI documentation

Each test file exports an array of test cases with:
```javascript
export default [
  {
    name: 'Test description',
    tool: 'sap_docs_search', 
    query: 'search query',
    expectIncludes: ['/expected/path/in/results.mdx']
  }
];
```

### Community Search Tests
- **`community-search.ts`**: Comprehensive tests for SAP Community search functionality
- **`test-updated-search.ts`**: Additional community search validation

### Utilities (`test/_utils/`)
- **`httpClient.js`**: Simple HTTP client for testing via the `/mcp` endpoint

## Running Tests

```bash
# Run all tool tests (recommended)
npm run test:tools

# Run a specific test file using --spec parameter
npm run test:tools -- --spec test/tools/sap_docs_search/search-cap-docs.js
npm run test:tools -- --spec sap_docs_search/search-cap-docs.js
npm run test:tools -- --spec search-cap-docs.js

# Show help and list available test files
npm run test:tools -- --help

# Run community search tests  
npm run test:community

# Run all tests (builds first, then runs tools)
npm test
```

## How It Works

1. **Single Server**: `run-tests.js` starts one HTTP server instance for all tests
2. **Simple Protocol**: Tests use the `/mcp` POST endpoint (simpler than full MCP protocol)
3. **Flexible Execution**: Run all tests or specify individual files using `--spec` parameter
4. **Modular Cases**: Each source has its own test file with multiple test cases
5. **Fast Execution**: No server restart between test cases

## Adding New Tests

To add tests for a new documentation source:

1. Create `test/tools/sap_docs_search/search-[source-name].js`
2. Export an array of test cases following the format above
3. Run `npm run test:tools` to verify

## Test Coverage

The tool tests validate:
- **Search Accuracy**: Expected documents appear in search results
- **Source Coverage**: All documentation sources return relevant results  
- **Query Handling**: Various query types and formats work correctly
- **Result Quality**: Search scoring and ranking produce expected results