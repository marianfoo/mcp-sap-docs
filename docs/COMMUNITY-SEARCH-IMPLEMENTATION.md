# SAP Community Search Implementation

## Overview

The SAP Community search has been completely rewritten to use HTML scraping instead of the LiQL API approach, providing better search results that match the SAP Community's "Best Match" ranking algorithm.

## New Implementation Details

### 1. HTML Scraping Module (`src/lib/communityBestMatch.ts`)

**Key Features:**
- Direct HTML scraping of SAP Community search results
- Extracts comprehensive metadata: title, author, publish date, likes, snippet, tags
- Zero external dependencies - uses native Node.js `fetch` and regex parsing
- Respects SAP Community's "Best Match" ranking
- Includes both search and full post retrieval functions

**Functions:**
- `searchCommunityBestMatch(query, options)` - Search for community posts via HTML scraping
- `getCommunityPostByUrl(url, userAgent)` - Get full post content from URL (fallback method)
- `getCommunityPostsByIds(postIds, userAgent)` - **NEW**: Batch retrieve multiple posts via LiQL API  
- `getCommunityPostById(postId, userAgent)` - **NEW**: Single post retrieval via LiQL API
- `searchAndGetTopPosts(query, topN, options)` - **NEW**: Search + batch retrieve in one call

### 2. Updated Search Integration (`src/lib/localDocs.ts`)

**Changes:**
- Replaced LiQL API calls with HTML scraping
- Enhanced SearchResult interface with new fields (author, likes, tags)
- Improved post ID handling for both legacy and new URL-based formats
- Better error handling and graceful fallbacks

### 3. Enhanced Type Definitions (`src/lib/types.ts`)

**New SearchResult fields:**
- `author?: string` - Post author name
- `likes?: number` - Number of kudos/likes
- `tags?: string[]` - Associated topic tags

## Usage

### Search Community Posts
```javascript
import { searchCommunityBestMatch } from './src/lib/communityBestMatch.js';

const results = await searchCommunityBestMatch('SAPUI5 wizard', {
  includeBlogs: true,
  limit: 10,
  userAgent: 'MyApp/1.0'
});
```

### Batch Retrieve Multiple Posts (Recommended)
```javascript
import { getCommunityPostsByIds } from './src/lib/communityBestMatch.js';

// Efficient batch retrieval using LiQL API
const posts = await getCommunityPostsByIds(['13961398', '13446100', '14152848'], 'MyApp/1.0');
// Returns: { '13961398': 'formatted content...', '13446100': 'formatted content...', ... }
```

### Search + Get Top Posts (One-Stop Solution)
```javascript
import { searchAndGetTopPosts } from './src/lib/communityBestMatch.js';

// Search and get full content of top 3 posts in one call
const { search, posts } = await searchAndGetTopPosts('odata cache', 3, {
  includeBlogs: true,
  userAgent: 'MyApp/1.0'
});

search.forEach((result, index) => {
  console.log(`${index + 1}. ${result.title}`);
  if (posts[result.postId]) {
    console.log(posts[result.postId]); // Full formatted content
  }
});
```

### Single Post Retrieval
```javascript
import { getCommunityPostById } from './src/lib/communityBestMatch.js';

const content = await getCommunityPostById('13961398', 'MyApp/1.0');
```

### Fallback: Get Full Post Content by URL
```javascript
import { getCommunityPostByUrl } from './src/lib/communityBestMatch.js';

const content = await getCommunityPostByUrl(
  'https://community.sap.com/t5/technology-blogs-by-sap/...',
  'MyApp/1.0'
);
```

### Via MCP Server
The community search is exposed as the `sap_community_search` tool, which now **automatically returns the full content** of the top 3 most relevant posts using the efficient LiQL API batch retrieval. Individual posts can also be retrieved using `fetch` with community post IDs.

**Key Behavior:**
- **`sap_community_search`**: Returns full content of top 3 posts (search + batch retrieval in one call)
- **`fetch`**: Retrieves individual post content by ID

## Testing

### Run the Test Suite
```bash
# Run comprehensive test suite (recommended)
npm run test:community

# Run directly with Node.js (TypeScript support)
node test/community-search.ts
```

The **unified test suite** (`test/community-search.ts`) covers:
- **HTML Search Scraping**: Search accuracy, post ID extraction, metadata parsing
- **LiQL API Batch Retrieval**: Efficient multi-post content retrieval
- **Single Post Retrieval**: Individual post fetching via API
- **Convenience Functions**: Combined search + batch retrieval workflow
- **Direct API Testing**: Raw LiQL API validation
- **Known Post Validation**: Testing with specific real posts

### Test Features
- **TypeScript**: Modern, type-safe test implementation
- **Comprehensive Coverage**: All functionality tested in one script
- **Organized Structure**: Modular test functions with clear separation
- **Real-time Validation**: Tests against live SAP Community data
- **Error Handling**: Robust error reporting and graceful failures

## Benefits of the New Implementation

1. **Better Search Results**: Uses SAP Community's native "Best Match" algorithm
2. **Richer Metadata**: Extracts author, likes, tags, and better snippets  
3. **Efficient Batch Retrieval**: LiQL API for fast bulk post content retrieval
4. **Hybrid Approach**: HTML scraping for search + API calls for content = best of both worlds
5. **One-Stop Functions**: `searchAndGetTopPosts()` combines search + retrieval in single call
6. **Improved Reliability**: Fallback methods for different scenarios
7. **Real-time Data**: Gets the same results users see on the website

## Technical Notes

### HTML Parsing Strategy
- Uses regex patterns to extract structured data from Khoros-based SAP Community
- Targets stable CSS classes and HTML structure patterns
- Includes fallback patterns for different page layouts
- Sanitizes and decodes HTML entities properly

### Rate Limiting & Respect
- Includes User-Agent identification
- Test script includes delays between requests
- Graceful error handling for HTTP failures
- Respects community guidelines

### Post ID Formats
The system now supports two post ID formats:
1. **Legacy**: `community-postId` (tries to construct URL)
2. **New**: `community-url-encodedUrl` (direct URL extraction)

### Error Handling
- Network failures return empty results instead of crashing
- HTML parsing errors are logged but don't break the search
- Malformed URLs are handled gracefully
- User-Agent can be customized for identification

## Future Enhancements

1. **Caching**: Add optional caching layer for frequently accessed posts
2. **Pagination**: Support for multiple result pages
3. **Advanced Filtering**: Filter by author, date range, or specific tags
4. **Performance**: Add connection pooling for high-volume usage

## Migration Notes

The new implementation is a **drop-in replacement** for the old LiQL-based approach:
- Same function signatures for `searchCommunity()`
- Same MCP tool interface (`sap_community_search`)
- Enhanced with additional metadata fields
- Backward compatible post ID handling