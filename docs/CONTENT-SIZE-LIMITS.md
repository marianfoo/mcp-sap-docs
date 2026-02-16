> Historical documentation note
>
> This file is kept for background and milestone history.
> For the current architecture and operational model, start with:
> README.md, docs/ARCHITECTURE.md, docs/DEV.md, docs/TESTS.md, and docs/UPSTREAM-ONE-WAY-SYNC-IMPLEMENTATION.md.

# Content Size Limits

## Overview

To ensure optimal performance and prevent token overflow in LLM interactions, the server implements intelligent content size limits for SAP Help Portal and Community content retrieval.

## Configuration

### Maximum Content Length

**Default: 75,000 characters** (~18,750 tokens)

This limit is configurable in `/src/lib/config.ts`:

```typescript
export const CONFIG = {
  // Maximum content length for SAP Help and Community full content retrieval
  // Limits help prevent token overflow and keep responses manageable (~18,750 tokens)
  MAX_CONTENT_LENGTH: 75000,  // 75,000 characters
};
```

## Affected Tools

The content size limit applies to the following MCP tools:

### 1. `sap_help_get`
Retrieves full SAP Help Portal pages. If content exceeds 75,000 characters, it is intelligently truncated while preserving:
- Beginning section (introduction and main content)
- End section (conclusions and examples)
- A clear truncation notice showing what was omitted

### 2. `sap_community_search`
Returns full content of top 3 SAP Community posts. Each post is truncated if needed using the same intelligent algorithm.

### 3. Community Post Retrieval
Individual community posts fetched via `fetch` tool with `community-*` IDs are also subject to truncation.

## Intelligent Truncation Algorithm

When content exceeds the maximum length, the truncation algorithm:

### Preservation Strategy
- **60%** from the beginning (introduction, overview, main content)
- **20%** from the end (conclusions, examples, summaries)
- **20%** reserved for truncation notice and natural break padding

### Natural Boundaries
The algorithm attempts to break content at natural points rather than mid-sentence:
1. Paragraph breaks (`\n\n`)
2. Markdown headings (`# Heading`)
3. Code block boundaries (` ```\n`)
4. Horizontal rules (`---`)
5. Sentence endings (`. `)

### Truncation Notice
A clear notice is inserted showing:
- Original content length in characters
- Approximate original token count (chars ÷ 4)
- Number of omitted characters
- Percentage of content omitted
- Explanation that beginning and end are preserved

Example truncation notice:
```markdown
---

⚠️ **Content Truncated**

The full content was 425,000 characters (approximately 106,250 tokens).
For readability and performance, 350,000 characters (82%) have been omitted from the middle section.

The beginning and end of the document are preserved above and below this notice.

---
```

## Rationale

### Why 75,000 Characters?

1. **LLM Context Windows**: Fits comfortably in most modern LLM context windows:
   - Claude 3.5 Sonnet: 200k tokens (can handle ~800k chars)
   - GPT-4 Turbo: 128k tokens (can handle ~512k chars)
   - Leaves room for conversation history and system prompts

2. **Performance**: Reduces response time and API costs while maintaining comprehensive coverage

3. **Readability**: Very long documents (>100k chars) are often better consumed in multiple focused queries

4. **Practical Coverage**: 75k characters is sufficient for most documentation pages while preventing extreme cases

### Alternative Approaches Considered

| Approach | Characters | Tokens (approx) | Trade-off |
|----------|-----------|-----------------|-----------|
| Conservative | 50,000 | ~12,500 | Too restrictive for comprehensive docs |
| **Current** | **75,000** | **~18,750** | **Balanced - recommended** |
| Generous | 100,000 | ~25,000 | Risk of slow responses |
| Maximum | 150,000 | ~37,500 | Only for edge cases |

## Implementation Details

### Source Files

- **Configuration**: `/src/lib/config.ts` - MAX_CONTENT_LENGTH constant
- **Truncation Logic**: `/src/lib/truncate.ts` - Intelligent truncation implementation
- **SAP Help**: `/src/lib/sapHelp.ts` - Applied in `getSapHelpContent()`
- **Community**: `/src/lib/communityBestMatch.ts` - Applied in post retrieval functions

### Functions

#### `truncateContent(content: string, maxLength?: number): TruncationResult`
Main truncation function with beginning/end preservation.

**Returns:**
```typescript
{
  content: string;          // Truncated content
  wasTruncated: boolean;    // Whether truncation occurred
  originalLength: number;   // Original character count
  truncatedLength: number;  // Final character count
}
```

#### `truncateContentSimple(content: string, maxLength?: number): TruncationResult`
Alternative truncation function that only preserves beginning with end notice.

## Monitoring and Adjustment

### When to Increase Limit

Consider increasing if:
- Users frequently encounter truncated content
- Average document sizes are near the limit
- LLM context windows have increased significantly

### When to Decrease Limit

Consider decreasing if:
- Response times are too slow
- Token costs are concerning
- Most content doesn't use the available space

### Override for Specific Cases

To override the limit for specific use cases, modify the `truncateContent()` call:

```typescript
// Custom limit of 100,000 characters
const truncationResult = truncateContent(fullContent, 100000);
```

## User Experience

### Transparent Communication

When content is truncated, users see:
- Clear visual indicator (⚠️ warning emoji)
- Exact statistics (original length, omitted amount, percentage)
- Explanation of what's preserved
- No disruption to markdown formatting

### Best Practices for Users

1. **Specific Queries**: Ask focused questions to get relevant sections
2. **Multiple Requests**: Break very long documents into targeted fetches
3. **Search First**: Use `sap_help_search` to find specific sections before fetching
4. **Check URLs**: Visit the provided URLs for complete untruncated content

## Future Enhancements

Potential improvements to consider:

1. **Dynamic Limits**: Adjust based on LLM context window
2. **Sectioned Retrieval**: Fetch specific document sections
3. **Summary Generation**: Auto-summarize omitted middle sections
4. **User Preferences**: Allow users to specify their preferred limits
5. **Compression**: Apply content compression for technical reference material

## Testing

Content size limits are tested in:
- Unit tests for truncation functions
- Integration tests for SAP Help and Community tools
- Manual validation with known large documents

## Related Documentation

- **Architecture**: `/docs/ARCHITECTURE.md` - System overview
- **Tool Descriptions**: `/docs/CURSOR-SETUP.md` - MCP tool documentation
- **Community Search**: `/docs/COMMUNITY-SEARCH-IMPLEMENTATION.md` - Community integration details

