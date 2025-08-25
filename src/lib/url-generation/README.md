# URL Generation System

This directory contains the URL generation system for the SAP Docs MCP server. It provides source-specific URL builders that generate accurate links to documentation based on content metadata and file paths.

## Architecture

The system is organized into source-specific modules with a centralized dispatcher:

```
src/lib/url-generation/
├── index.ts          # Main entry point and dispatcher
├── utils.ts          # Common utilities (frontmatter parsing, path handling)
├── cloud-sdk.ts      # SAP Cloud SDK URL generation
├── sapui5.ts         # SAPUI5/OpenUI5 URL generation
├── cap.ts            # SAP CAP URL generation
├── wdi5.ts           # wdi5 testing framework URL generation
└── README.md         # This file
```

## Key Features

### 1. Frontmatter-Based URL Generation

The system extracts metadata from document frontmatter to generate accurate URLs:

```yaml
---
id: remote-debugging
title: Remotely debug an application on SAP BTP
slug: debug-guide
---
```

### 2. Source-Specific Handlers

Each documentation source has its own URL generation logic:

- **Cloud SDK**: Uses frontmatter `id` with section-based paths
- **SAPUI5**: Uses topic IDs and API control names
- **CAP**: Uses docsify-style URLs with section handling
- **wdi5**: Uses docsify-style URLs with testing-specific sections

### 3. Fallback Mechanism

If no source-specific handler is available, the system falls back to generic filename-based URL generation.

### 4. Anchor Generation

Automatically detects main headings in content and generates appropriate anchor fragments based on the documentation platform's anchor style.

## Usage

### Basic Usage

```typescript
import { generateDocumentationUrl } from './url-generation/index.js';
import { getDocUrlConfig } from '../metadata.js';

const config = getDocUrlConfig('/cloud-sdk-js');
const url = generateDocumentationUrl(
  '/cloud-sdk-js',
  'guides/debug-remote-app.mdx',
  content,
  config
);
// Result: https://sap.github.io/cloud-sdk/docs/js/guides/remote-debugging
```

### Using Utilities Directly

```typescript
import { parseFrontmatter, extractSectionFromPath, buildUrl } from './url-generation/utils.js';

// Parse document metadata
const frontmatter = parseFrontmatter(content);

// Extract section from file path
const section = extractSectionFromPath('guides/tutorial.mdx'); // '/guides/'

// Build clean URLs
const url = buildUrl('https://example.com', 'docs', 'guides', 'tutorial');
```

## Supported Sources

### SAP Cloud SDK (`/cloud-sdk-js`, `/cloud-sdk-java`, `/cloud-sdk-ai-js`, `/cloud-sdk-ai-java`)

- Uses frontmatter `id` field for URL generation
- Automatically detects sections: guides, features, tutorials, environments
- Example: `https://sap.github.io/cloud-sdk/docs/js/guides/remote-debugging`

### SAPUI5 (`/sapui5`, `/openui5-api`, `/openui5-samples`)

- **SAPUI5 Docs**: Uses topic IDs from frontmatter or filename
- **API Docs**: Uses control/namespace paths
- **Samples**: Uses sample-specific paths
- Example: `https://ui5.sap.com/#/topic/123e4567-e89b-12d3-a456-426614174000`

### CAP (`/cap`)

- Uses docsify-style URLs with `#/` fragments
- Supports frontmatter `id` and `slug` fields
- Handles CDS reference docs, tutorials, and guides
- Example: `https://cap.cloud.sap/docs/#/guides/getting-started`

### wdi5 (`/wdi5`)

- Uses docsify-style URLs for testing documentation
- Handles configuration, selectors, and usage guides
- Example: `https://ui5-community.github.io/wdi5/#/configuration/basic`

## Adding New Sources

To add support for a new documentation source:

1. **Create a new source file** (e.g., `my-source.ts`):

```typescript
import { parseFrontmatter, buildUrl } from './utils.js';
import { DocUrlConfig } from '../metadata.js';

export interface MySourceUrlOptions {
  relFile: string;
  content: string;
  config: DocUrlConfig;
  libraryId: string;
}

export function generateMySourceUrl(options: MySourceUrlOptions): string | null {
  const { relFile, content, config } = options;
  const frontmatter = parseFrontmatter(content);
  
  // Your URL generation logic here
  if (frontmatter.id) {
    return buildUrl(config.baseUrl, 'docs', frontmatter.id);
  }
  
  // Fallback logic
  return null;
}
```

2. **Register in the main dispatcher** (`index.ts`):

```typescript
import { generateMySourceUrl, MySourceUrlOptions } from './my-source.js';

const sourceGenerators: Record<string, (options: UrlGenerationOptions) => string | null> = {
  // ... existing generators
  '/my-source': (options) => generateMySourceUrl({
    ...options,
    libraryId: options.libraryId
  } as MySourceUrlOptions),
};
```

3. **Add tests** in `test/url-generation.test.ts`

4. **Export functions** at the bottom of `index.ts`

## Testing

The system includes comprehensive tests covering:

- Utility functions (frontmatter parsing, path handling, URL building)
- Source-specific URL generation
- Main dispatcher functionality
- Error handling

Run tests with:

```bash
npm test test/url-generation.test.ts
```

## Configuration

URL generation is configured through the metadata system. Each source should have:

```json
{
  "id": "my-source",
  "libraryId": "/my-source",
  "baseUrl": "https://docs.example.com",
  "pathPattern": "/{file}",
  "anchorStyle": "github"
}
```

- `baseUrl`: Base URL for the documentation site
- `pathPattern`: Pattern for constructing paths (`{file}` is replaced with filename)
- `anchorStyle`: How to format anchor fragments (`github`, `docsify`, or `custom`)

## Best Practices

1. **Always use frontmatter when available** - It provides the most reliable URL generation
2. **Handle multiple content patterns** - Documents may have different structures
3. **Provide fallbacks** - Always have a fallback for when specialized logic fails
4. **Test thoroughly** - Include tests for different content patterns and edge cases
5. **Document special cases** - Add comments for source-specific URL patterns

## Troubleshooting

### URLs not generating correctly

1. Check if the source has proper metadata configuration
2. Verify frontmatter format in test documents
3. Ensure the source is registered in the dispatcher
4. Check console logs for fallback usage messages

### Tests failing

1. Verify expected URLs match the actual anchor generation behavior
2. Check that frontmatter parsing handles the content format correctly
3. Ensure path section extraction works with the file structure

### New source not working

1. Confirm the source ID matches between metadata and dispatcher
2. Verify the URL generation function is exported and imported correctly
3. Check that the function returns non-null values for valid inputs

