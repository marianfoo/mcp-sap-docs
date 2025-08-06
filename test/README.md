# Test Suite

This directory contains the test suite for the SAP Community Search functionality.

## Main Test File

### `community-search.ts`
Comprehensive TypeScript test suite that covers all aspects of the SAP Community search implementation:

- **HTML Search Scraping**: Tests the search functionality using SAP Community's "Best Match" algorithm
- **LiQL API Batch Retrieval**: Tests efficient bulk post content retrieval
- **Single Post Retrieval**: Tests individual post fetching
- **Convenience Functions**: Tests the `searchAndGetTopPosts()` one-stop solution
- **Direct API Testing**: Tests raw LiQL API calls
- **Real Post Validation**: Tests with known live posts

## Running Tests

```bash
# Run via npm script (recommended)
npm run test:community

# Run directly with Node.js (TypeScript support)
node test/community-search.ts
```

## Test Coverage

The test suite validates:

1. **Search Functionality**
   - HTML parsing accuracy
   - Post ID extraction from `data-lia-message-uid` attributes
   - Metadata extraction (author, likes, tags, snippets)
   - Search result ranking and relevance

2. **Content Retrieval**
   - Batch retrieval using LiQL API with post IDs
   - Single post retrieval efficiency
   - Content formatting and structure
   - Error handling and fallbacks

3. **Integration Testing**
   - End-to-end workflow from search to content retrieval
   - API response validation
   - Real-time data accuracy

4. **Performance & Reliability**
   - Rate limiting and respectful API usage
   - Error handling and graceful failures
   - Network timeout handling

## Example Output

The test suite provides detailed output including:
- ✅ Success indicators for each test
- 📦 Batch retrieval results with post previews
- 🔍 Search result validation
- 📋 Usage examples and code snippets
- ⚠️ Warnings for any issues encountered

## Test Data

Tests use a combination of:
- **Live data** from SAP Community (real search results)
- **Known post IDs** for validation (e.g., `13961398` - FIORI Cache Maintenance)
- **Multiple search queries** to test different scenarios

This ensures the tests validate against current, real-world SAP Community content and structure.