/**
 * Base Server Handler - Shared functionality for MCP servers
 * Eliminates code duplication between stdio and HTTP server implementations
 * 
 * IMPORTANT FOR LLMs/AI ASSISTANTS:
 * =================================
 * The function names in this MCP server may appear with different prefixes depending on your MCP client:
 * - Simple names: search, fetch, sap_community_search, sap_help_search, sap_help_get
 * - Prefixed names: mcp_sap-docs-remote_search, mcp_sap-docs-remote_fetch, etc.
 * 
 * Try the simple names first, then the prefixed versions if they don't work.
 * 
 * Note: sap_docs_search and sap_docs_get are legacy aliases for backward compatibility.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import {
  searchLibraries,
  fetchLibraryDocumentation,
  listDocumentationResources,
  readDocumentationResource,
  searchCommunity
} from "./localDocs.js";
import { searchSapHelp, getSapHelpContent } from "./sapHelp.js";

import { SearchResponse } from "./types.js";
import { logger } from "./logger.js";
import { search } from "./search.js";
import { CONFIG } from "./config.js";
import { loadMetadata, getDocUrlConfig } from "./metadata.js";
import { generateDocumentationUrl, formatSearchResult } from "./url-generation/index.js";

/**
 * Helper functions for creating structured JSON responses compatible with ChatGPT and all MCP clients
 */

interface SearchResult {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  score?: number;
  metadata?: Record<string, any>;
}

interface DocumentResult {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata?: Record<string, any>;
}

/**
 * Create structured JSON response for search results (ChatGPT-compatible)
 */
function createSearchResponse(results: SearchResult[]): any {
  // Clean the results to avoid JSON serialization issues in MCP protocol
  const cleanedResults = results.map(result => ({
    // ChatGPT requires: id, title, url (other fields optional)
    id: result.id,
    title: result.title ? result.title.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n') : result.title,
    url: result.url,
    // Additional fields for enhanced functionality
    snippet: result.snippet ? result.snippet.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n') : result.snippet,
    score: result.score,
    metadata: result.metadata
  }));
  
  // ChatGPT expects: { "results": [...] } in JSON-encoded text content
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ results: cleanedResults })
      }
    ]
  };
}

/**
 * Create structured JSON response for document fetch (ChatGPT-compatible)
 */
function createDocumentResponse(document: DocumentResult): any {
  // Clean the text content to avoid JSON serialization issues in MCP protocol
  const cleanedDocument = {
    // ChatGPT requires: id, title, text, url, metadata
    id: document.id,
    title: document.title,
    text: document.text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except \n, \r, \t
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n'), // Convert remaining \r to \n
    url: document.url,
    metadata: document.metadata
  };
  
  // ChatGPT expects document object as JSON-encoded text content
  return {
    content: [
      {
        type: "text", 
        text: JSON.stringify(cleanedDocument)
      }
    ]
  };
}

/**
 * Create error response in structured JSON format
 */
function createErrorResponse(error: string, requestId?: string): any {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ 
          error,
          requestId: requestId || 'unknown'
        })
      }
    ]
  };
}

export interface ServerConfig {
  name: string;
  description: string;
  version: string;
}

/**
 * Helper function to extract client metadata from request
 */
function extractClientMetadata(request: any): Record<string, any> {
  const metadata: Record<string, any> = {};
  
  // Try to extract available metadata from the request
  if (request.meta) {
    metadata.meta = request.meta;
  }
  
  // Extract any client identification from headers or other sources
  if (request.headers) {
    metadata.headers = request.headers;
  }
  
  // Extract transport information if available
  if (request.transport) {
    metadata.transport = request.transport;
  }
  
  // Extract session or connection info
  if (request.id) {
    metadata.requestId = request.id;
  }
  
  return metadata;
}

/**
 * Base Server Handler Class
 * Provides shared functionality for all MCP server implementations
 */
export class BaseServerHandler {
  
  /**
   * Configure server with shared resource and tool handlers
   */
  static configureServer(srv: Server): void {
    // Only setup resource handlers if resources capability is enabled
    // DISABLED: Resources capability causes 60,000+ resources which breaks Cursor
    // this.setupResourceHandlers(srv);
    this.setupToolHandlers(srv);

    const capabilities = (srv as unknown as { _capabilities?: { prompts?: object } })._capabilities;
    if (capabilities?.prompts) {
      this.setupPromptHandlers(srv);
    }
  }

  /**
   * Setup resource handlers (shared between all server types)
   */
  private static setupResourceHandlers(srv: Server): void {
    // List available resources
    srv.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = await listDocumentationResources();
      return { resources };
    });

    // Read resource contents
    srv.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      try {
        return await readDocumentationResource(uri);
      } catch (error: any) {
        return {
          contents: [{
            uri,
            mimeType: "text/plain",
            text: `Error reading resource: ${error.message}`
          }]
        };
      }
    });
  }

  /**
   * Setup tool handlers (shared between all server types)
   */
  private static setupToolHandlers(srv: Server): void {
    // List available tools
    srv.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "sap_community_search", 
            description: `SEARCH SAP COMMUNITY: sap_community_search(query="search terms")

FUNCTION NAME: sap_community_search (or mcp_sap-docs-remote_sap_community_search)

FINDS: Blog posts, discussions, solutions from SAP Community
INCLUDES: Engagement data (kudos), ranked by "Best Match"

TYPICAL WORKFLOW:
1. sap_community_search(query="your problem + error code")
2. fetch(id="community-12345") for full posts

BEST FOR TROUBLESHOOTING:
• Include error codes: "415 error", "500 error"
• Be specific: "CAP action binary upload 415"
• Use real scenarios: "wizard implementation issues"`,
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search terms for SAP Community. Include error codes and specific technical details.",
                  examples: [
                    "CAP action parameter binary file upload 415 error",
                    "wizard implementation best practices",
                    "fiori elements authentication",
                    "UI5 deployment issues",
                    "wdi5 test automation problems"
                  ]
                }
              },
              required: ["query"]
            }
          },
          {
            name: "sap_help_search",
            description: `SEARCH SAP HELP PORTAL: sap_help_search(query="product + topic")

FUNCTION NAME: sap_help_search (or mcp_sap-docs-remote_sap_help_search)

SEARCHES: Official SAP Help Portal (help.sap.com)
COVERS: Product guides, implementation guides, technical documentation

TYPICAL WORKFLOW:
1. sap_help_search(query="product name + configuration topic")
2. sap_help_get(result_id="sap-help-12345abc")

BEST PRACTICES:
• Include product names: "S/4HANA", "BTP", "Fiori"
• Add specific tasks: "configuration", "setup", "deployment"
• Use official SAP terminology`,
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search terms for SAP Help Portal. Include product names and specific topics.",
                  examples: [
                    "S/4HANA configuration",
                    "Fiori Launchpad setup", 
                    "BTP integration",
                    "ABAP development guide",
                    "SAP Analytics Cloud setup"
                  ]
                }
              },
              required: ["query"]
            }
          },
          {
            name: "sap_help_get", 
            description: `GET SAP HELP PAGE: sap_help_get(result_id="sap-help-12345abc")

FUNCTION NAME: sap_help_get (or mcp_sap-docs-remote_sap_help_get)

RETRIEVES: Complete SAP Help Portal page content
REQUIRES: Exact result_id from sap_help_search

USAGE PATTERN:
1. Get ID from sap_help_search results  
2. Use exact ID (don't modify the format)
3. Receive full page content + metadata`,
            inputSchema: {
              type: "object",
              properties: {
                result_id: {
                  type: "string",
                  description: "Exact ID from sap_help_search results. Copy the ID exactly as returned.",
                  examples: [
                    "sap-help-12345abc",
                    "sap-help-98765def"
                  ]
                }
              },
              required: ["result_id"]
            }
          },
          {
            name: "search",
            description: `SEARCH SAP DOCS: search(query="search terms")

FUNCTION NAME: search

COVERS: ABAP (all versions), UI5, CAP, wdi5, OpenUI5 APIs, Cloud SDK
AUTO-DETECTS: ABAP versions from query (e.g. "LOOP 7.57", defaults to 7.58)

TYPICAL WORKFLOW:
1. search(query="your search terms") 
2. fetch(id="result_id_from_step_1")

QUERY TIPS:
• Be specific: "CAP action binary parameter" not just "CAP"
• Include error codes: "415 error CAP action"
• Use technical terms: "LargeBinary MediaType XMLHttpRequest"
• For ABAP: Include version like "7.58" or "latest"`,
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search terms using natural language. Be specific and include technical terms.",
                  examples: [
                    "CAP binary data LargeBinary MediaType",
                    "UI5 button properties",
                    "wdi5 testing locators", 
                    "ABAP SELECT statements 7.58",
                    "415 error CAP action parameter"
                  ]
                }
              },
              required: ["query"]
            }
          },
          {
            name: "fetch",
            description: `GET SPECIFIC DOCS: fetch(id="result_id")

FUNCTION NAME: fetch

RETRIEVES: Full content from search results
WORKS WITH: Document IDs returned by search

ChatGPT COMPATIBLE:
• Uses "id" parameter (required by ChatGPT)
• Returns structured JSON content
• Includes full document text and metadata`,
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Unique document ID from search results. Use exact IDs returned by search.",
                  examples: [
                    "/cap/guides/domain-modeling",
                    "/sapui5/controls/button-properties", 
                    "/openui5-api/sap/m/Button",
                    "/abap-docs-758/inline-declarations",
                    "community-12345"
                  ]
                }
              },
              required: ["id"]
            }
          },

        ]
      };
    });

    // Handle tool execution
    srv.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const clientMetadata = extractClientMetadata(request);

      if (name === "sap_docs_search" || name === "search") {
        const { query } = args as { query: string };
        
        // Enhanced logging with timing
        const timing = logger.logToolStart(name, query, clientMetadata);
        
        try {
          // Use hybrid search with reranking
          const results = await search(query, { 
            k: CONFIG.RETURN_K 
          });
          
          const topResults = results;
          
          if (topResults.length === 0) {
            logger.logToolSuccess(name, timing.requestId, timing.startTime, 0, { fallback: false });
            return createErrorResponse(
              `No results for "${query}". Try UI5 controls ("button", "table"), CAP topics ("actions", "binary"), testing ("wdi5", "e2e"), ABAP with versions ("SELECT 7.58"), or include error codes ("415 error").`,
              timing.requestId
            );
          }
          
          // Transform results to ChatGPT-compatible format with id, title, url
          const searchResults: SearchResult[] = topResults.map((r, index) => {
            // Extract library_id and topic from document ID
            const libraryIdMatch = r.id.match(/^(\/[^\/]+)/);
            const libraryId = libraryIdMatch ? libraryIdMatch[1] : (r.sourceId ? `/${r.sourceId}` : r.id);
            const topic = r.id.startsWith(libraryId) ? r.id.slice(libraryId.length + 1) : '';
            
            const config = getDocUrlConfig(libraryId);
            const docUrl = config ? generateDocumentationUrl(libraryId, '', r.text, config) : null;
            
            return {
              // ChatGPT-required format: id, title, url
              id: r.id,  // Use full document ID as required by ChatGPT
              title: r.text.split('\n')[0] || r.id,
              url: docUrl || `#${r.id}`,
              // Additional fields for backward compatibility
              library_id: libraryId,
              topic: topic,
              snippet: r.text ? r.text.substring(0, CONFIG.EXCERPT_LENGTH_MAIN) + '...' : '',
              score: r.finalScore,
              metadata: {
                source: r.sourceId || 'sap-docs',
                library: libraryId,
                bm25Score: r.bm25,
                rank: index + 1
              }
            };
          });
          
          logger.logToolSuccess(name, timing.requestId, timing.startTime, topResults.length, { fallback: false });
          
          return createSearchResponse(searchResults);
        } catch (error) {
          logger.logToolError(name, timing.requestId, timing.startTime, error, false);
          logger.info('Attempting fallback to original search after hybrid search failure');
          
          // Fallback to original search
          try {
            const res: SearchResponse = await searchLibraries(query);
            
            if (!res.results.length) {
              logger.logToolSuccess(name, timing.requestId, timing.startTime, 0, { fallback: true });
              return createErrorResponse(
                res.error || `No fallback results for "${query}". Try UI5 controls ("button", "table"), CAP topics ("actions", "binary"), testing ("wdi5", "e2e"), ABAP with versions ("SELECT 7.58"), or include error codes.`,
                timing.requestId
              );
            }
            
            // Transform fallback results to structured format
            const fallbackResults: SearchResult[] = res.results.map((r, index) => ({
              id: r.id || `fallback-${index}`,
              title: r.title || 'SAP Documentation',
              url: r.url || `#${r.id}`,
              snippet: r.description ? r.description.substring(0, 200) + '...' : '',
              metadata: {
                source: 'fallback-search',
                rank: index + 1
              }
            }));
            
            logger.logToolSuccess(name, timing.requestId, timing.startTime, res.results.length, { fallback: true });
            
            return createSearchResponse(fallbackResults);
          } catch (fallbackError) {
            logger.logToolError(name, timing.requestId, timing.startTime, fallbackError, true);
            return createErrorResponse(
              `Search temporarily unavailable. Wait 30 seconds and retry, try sap_community_search instead, or use more specific search terms.`,
              timing.requestId
            );
          }
        }
      }

      if (name === "sap_community_search") {
        const { query } = args as { query: string };
        
        // Enhanced logging with timing
        const timing = logger.logToolStart(name, query, clientMetadata);
        
        try {
          const res: SearchResponse = await searchCommunity(query);
          
          if (!res.results.length) {
            logger.logToolSuccess(name, timing.requestId, timing.startTime, 0);
            return createErrorResponse(
              res.error || `No SAP Community posts found for "${query}". Try different keywords or check your connection.`,
              timing.requestId
            );
          }
          
          // Transform community search results to ChatGPT-compatible format
          const communityResults: SearchResult[] = res.results.map((r: any, index) => ({
            // ChatGPT-required format: id, title, url
            id: r.id || `community-${index}`,
            title: r.title || 'SAP Community Post',
            url: r.url || `#${r.id}`,
            // Additional fields for enhanced functionality
            library_id: r.library_id || `community-${index}`,
            topic: r.topic || '',
            snippet: r.snippet || (r.description ? r.description.substring(0, 200) + '...' : ''),
            score: r.score || 0,
            metadata: r.metadata || {
              source: 'sap-community',
              likes: r.likes,
              author: r.author,
              postTime: r.postTime,
              rank: index + 1
            }
          }));
          
          logger.logToolSuccess(name, timing.requestId, timing.startTime, res.results.length);
          
          return createSearchResponse(communityResults);
        } catch (error) {
          logger.logToolError(name, timing.requestId, timing.startTime, error);
          return createErrorResponse(
            `SAP Community search service temporarily unavailable. Please try again later.`,
            timing.requestId
          );
        }
      }

      if (name === "sap_docs_get" || name === "fetch") {
        // Handle both old format (library_id) and new ChatGPT format (id)
        const library_id = (args as any).library_id || (args as any).id;
        const topic = (args as any).topic || "";
        
        if (!library_id) {
          const timing = logger.logToolStart(name, 'missing_id', clientMetadata);
          logger.logToolError(name, timing.requestId, timing.startTime, new Error('Missing id parameter'));
          return createErrorResponse(
            `Missing required parameter: id. Please provide a document ID from search results.`,
            timing.requestId
          );
        }
        
        // Enhanced logging with timing
        const searchKey = library_id + (topic ? `/${topic}` : '');
        const timing = logger.logToolStart(name, searchKey, clientMetadata);
        
        try {
          const text = await fetchLibraryDocumentation(library_id, topic);
          
          if (!text) {
            logger.logToolSuccess(name, timing.requestId, timing.startTime, 0);
            return createErrorResponse(
              `Nothing found for ${library_id}`,
              timing.requestId
            );
          }
          
          // Transform document content to ChatGPT-compatible format
          const config = getDocUrlConfig(library_id);
          const docUrl = config ? generateDocumentationUrl(library_id, '', text, config) : null;
          const document: DocumentResult = {
            id: library_id,
            title: library_id.replace(/^\//, '').replace(/\//g, ' > ') + (topic ? ` (${topic})` : ''),
            text: text,
            url: docUrl || `#${library_id}`,
            metadata: {
              source: 'sap-docs',
              library: library_id,
              topic: topic || undefined,
              contentLength: text.length
            }
          };
          
          logger.logToolSuccess(name, timing.requestId, timing.startTime, 1, { 
            contentLength: text.length,
            libraryId: library_id,
            topic: topic || undefined
          });
          
          return createDocumentResponse(document);
        } catch (error) {
          logger.logToolError(name, timing.requestId, timing.startTime, error);
          return createErrorResponse(
            `Error retrieving documentation for ${library_id}. Please try again later.`,
            timing.requestId
          );
        }
      }

      if (name === "sap_help_search") {
        const { query } = args as { query: string };
        
        // Enhanced logging with timing
        const timing = logger.logToolStart(name, query, clientMetadata);
        
        try {
          const res: SearchResponse = await searchSapHelp(query);
          
          if (!res.results.length) {
            logger.logToolSuccess(name, timing.requestId, timing.startTime, 0);
            return createErrorResponse(
              res.error || `No SAP Help results found for "${query}". Try different keywords or check your connection.`,
              timing.requestId
            );
          }
          
          // Transform SAP Help search results to ChatGPT-compatible format
          const helpResults: SearchResult[] = res.results.map((r, index) => ({
            // ChatGPT-required format: id, title, url
            id: r.id || `sap-help-${index}`,
            title: r.title || 'SAP Help Document',
            url: r.url || `#${r.id}`,
            // Additional fields for enhanced functionality
            snippet: r.description ? r.description.substring(0, 200) + '...' : '',
            metadata: {
              source: 'sap-help',
              totalSnippets: r.totalSnippets,
              rank: index + 1
            }
          }));
          
          logger.logToolSuccess(name, timing.requestId, timing.startTime, res.results.length);
          
          return createSearchResponse(helpResults);
        } catch (error) {
          logger.logToolError(name, timing.requestId, timing.startTime, error);
          return createErrorResponse(
            `SAP Help search service temporarily unavailable. Please try again later.`,
            timing.requestId
          );
        }
      }

      if (name === "sap_help_get") {
        const { result_id } = args as { result_id: string };
        
        // Enhanced logging with timing
        const timing = logger.logToolStart(name, result_id, clientMetadata);
        
        try {
          const content = await getSapHelpContent(result_id);
          
          // Transform SAP Help content to structured format
          const document: DocumentResult = {
            id: result_id,
            title: `SAP Help Document (${result_id})`,
            text: content,
            url: `https://help.sap.com/#${result_id}`,
            metadata: {
              source: 'sap-help',
              resultId: result_id,
              contentLength: content.length
            }
          };
          
          logger.logToolSuccess(name, timing.requestId, timing.startTime, 1, { 
            contentLength: content.length,
            resultId: result_id
          });
          
          return createDocumentResponse(document);
        } catch (error) {
          logger.logToolError(name, timing.requestId, timing.startTime, error);
          return createErrorResponse(
            `Error retrieving SAP Help content. Please try again later.`,
            timing.requestId
          );
        }
      }



      throw new Error(`Unknown tool: ${name}`);
    });
  }

  /**
   * Setup prompt handlers (shared between all server types)
   */
  private static setupPromptHandlers(srv: Server): void {
    // List available prompts
    srv.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: "sap_search_help",
            title: "SAP Documentation Search Helper",
            description: "Helps users construct effective search queries for SAP documentation",
            arguments: [
              {
                name: "domain",
                description: "SAP domain (UI5, CAP, ABAP, etc.)",
                required: false
              },
              {
                name: "context",
                description: "Specific context or technology area",
                required: false
              }
            ]
          },
          {
            name: "sap_troubleshoot",
            title: "SAP Issue Troubleshooting Guide",
            description: "Guides users through troubleshooting common SAP development issues",
            arguments: [
              {
                name: "error_message",
                description: "Error message or symptom description",
                required: false
              },
              {
                name: "technology",
                description: "SAP technology stack (UI5, CAP, ABAP, etc.)",
                required: false
              }
            ]
          }
        ]
      };
    });

    // Get specific prompt
    srv.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      switch (name) {
        case "sap_search_help":
          const domain = args?.domain || "general SAP";
          const context = args?.context || "development";
          
          return {
            description: `Search helper for ${domain} documentation`,
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `I need help searching ${domain} documentation for ${context}. What search terms should I use to find the most relevant results?

Here are some tips for effective SAP documentation searches:

**For UI5/Frontend:**
- Include specific control names (e.g., "Table", "Button", "ObjectPage")
- Mention UI5 version if relevant
- Use terms like "properties", "events", "aggregations"

**For CAP/Backend:**
- Include CDS concepts (e.g., "entity", "service", "annotation")
- Mention specific features (e.g., "authentication", "authorization", "events")
- Use terms like "deployment", "configuration"

**For ABAP:**
- Include version number (e.g., "7.58", "latest")
- Use specific statement types (e.g., "SELECT", "LOOP", "MODIFY")
- Include object types (e.g., "class", "method", "interface")

**General Tips:**
- Be specific rather than broad
- Include error codes if troubleshooting
- Use technical terms rather than business descriptions
- Combine multiple related terms

What specific topic are you looking for help with?`
                }
              }
            ]
          };

        case "sap_troubleshoot":
          const errorMessage = args?.error_message || "an issue";
          const technology = args?.technology || "SAP";
          
          return {
            description: `Troubleshooting guide for ${technology}`,
            messages: [
              {
                role: "user", 
                content: {
                  type: "text",
                  text: `I'm experiencing ${errorMessage} with ${technology}. Let me help you troubleshoot this systematically.

**Step 1: Information Gathering**
- What is the exact error message or symptom?
- When does this occur (during development, runtime, deployment)?
- What were you trying to accomplish?
- What technology stack are you using?

**Step 2: Initial Search Strategy**
Let me search the SAP documentation for similar issues:

**For UI5 Issues:**
- Search for the exact error message
- Include control or component names
- Look for browser console errors

**For CAP Issues:**
- Check service definitions and annotations
- Look for deployment configuration
- Verify database connections

**For ABAP Issues:**
- Include ABAP version in search
- Look for syntax or runtime errors
- Check object dependencies

**Step 3: Common Solutions**
Based on the issue type, I'll search for:
- Official SAP documentation
- Community discussions
- Code examples and samples

Please provide more details about your specific issue, and I'll search for relevant solutions.`
                }
              }
            ]
          };

        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    });
  }

  /**
   * Initialize metadata system (shared initialization logic)
   */
  static initializeMetadata(): void {
    logger.info('Initializing BM25 search system...');
    try {
      loadMetadata();
      logger.info('Search system ready with metadata');
    } catch (error) {
      logger.warn('Metadata loading failed, using defaults', { error: String(error) });
      logger.info('Search system ready');
    }
  }
}
