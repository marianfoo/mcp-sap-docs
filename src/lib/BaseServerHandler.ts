/**
 * Base Server Handler - Shared functionality for MCP servers
 * Eliminates code duplication between stdio and HTTP server implementations
 * 
 * IMPORTANT FOR LLMs/AI ASSISTANTS:
 * =================================
 * The function names in this MCP server may appear with different prefixes depending on your MCP client:
 * - Simple names: sap_docs_search, sap_community_search, sap_docs_get, sap_help_search, sap_help_get
 * - Prefixed names: mcp_sap-docs-remote_sap_docs_search, mcp_sap-docs-remote_sap_community_search, etc.
 * 
 * Try the simple names first, then the prefixed versions if they don't work.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  CallToolRequestSchema,
  ListToolsRequestSchema
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
 * Create structured JSON response for search results
 */
function createSearchResponse(results: SearchResult[]): any {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ results })
      }
    ]
  };
}

/**
 * Create structured JSON response for document fetch
 */
function createDocumentResponse(document: DocumentResult): any {
  return {
    content: [
      {
        type: "text", 
        text: JSON.stringify(document)
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
    this.setupResourceHandlers(srv);
    this.setupToolHandlers(srv);
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
            name: "sap_docs_search",
            description: `SEARCH SAP DOCS: sap_docs_search(query="search terms")

FUNCTION NAME: sap_docs_search (or mcp_sap-docs-remote_sap_docs_search)

COVERS: ABAP (all versions), UI5, CAP, wdi5, OpenUI5 APIs, Cloud SDK
AUTO-DETECTS: ABAP versions from query (e.g. "LOOP 7.57", defaults to 7.58)

TYPICAL WORKFLOW:
1. sap_docs_search(query="your search terms") 
2. sap_docs_get(library_id="result_id_from_step_1")

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
            name: "sap_community_search", 
            description: `SEARCH SAP COMMUNITY: sap_community_search(query="search terms")

FUNCTION NAME: sap_community_search (or mcp_sap-docs-remote_sap_community_search)

FINDS: Blog posts, discussions, solutions from SAP Community
INCLUDES: Engagement data (kudos), ranked by "Best Match"

TYPICAL WORKFLOW:
1. sap_community_search(query="your problem + error code")
2. sap_docs_get(library_id="community-12345") for full posts

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
            name: "sap_docs_get",
            description: `GET SPECIFIC DOCS: sap_docs_get(library_id="result_id")

FUNCTION NAME: sap_docs_get (or mcp_sap-docs-remote_sap_docs_get)

RETRIEVES: Full content from search results
WORKS WITH: Library IDs, document IDs, community post IDs

COMMON PATTERNS:
• Broad exploration: library_id="/cap", topic="binary"
• Specific API: library_id="/openui5-api/sap/m/Button" 
• Community posts: library_id="community-12345"
• ABAP docs: library_id="/abap-docs-758/abeninline_declarations"`,
            inputSchema: {
              type: "object",
              properties: {
                library_id: {
                  type: "string",
                  description: "ID from sap_docs_search or sap_community_search results. Use exact IDs returned by search functions.",
                  examples: [
                    "/cap",
                    "/sapui5", 
                    "/openui5-api/sap/m/Button",
                    "/abap-docs-758",
                    "community-12345"
                  ]
                },
                topic: {
                  type: "string", 
                  description: "Optional topic filter for library IDs only (not specific document IDs).",
                  examples: [
                    "binary",
                    "authentication", 
                    "properties",
                    "methods",
                    "locators"
                  ]
                }
              },
              required: ["library_id"]
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
            description: `SEARCH SAP DOCS (alias for sap_docs_search): search(query="search terms")

FUNCTION NAME: search (alias for sap_docs_search)

COVERS: ABAP (all versions), UI5, CAP, wdi5, OpenUI5 APIs, Cloud SDK
AUTO-DETECTS: ABAP versions from query (e.g. "LOOP 7.57", defaults to 7.58)

TYPICAL WORKFLOW:
1. search(query="your search terms") 
2. fetch(library_id="result_id_from_step_1")

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
            description: `GET SPECIFIC DOCS (alias for sap_docs_get): fetch(library_id="result_id")

FUNCTION NAME: fetch (alias for sap_docs_get)

RETRIEVES: Full content from search results
WORKS WITH: Library IDs, document IDs, community post IDs

COMMON PATTERNS:
• Broad exploration: library_id="/cap", topic="binary"
• Specific API: library_id="/openui5-api/sap/m/Button" 
• Community posts: library_id="community-12345"
• ABAP docs: library_id="/abap-docs-758/abeninline_declarations"`,
            inputSchema: {
              type: "object",
              properties: {
                library_id: {
                  type: "string",
                  description: "ID from search results. Use exact IDs returned by search functions.",
                  examples: [
                    "/cap",
                    "/sapui5", 
                    "/openui5-api/sap/m/Button",
                    "/abap-docs-758",
                    "community-12345"
                  ]
                },
                topic: {
                  type: "string", 
                  description: "Optional topic filter for library IDs only (not specific document IDs).",
                  examples: [
                    "binary",
                    "authentication", 
                    "properties",
                    "methods",
                    "locators"
                  ]
                }
              },
              required: ["library_id"]
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
          
          // Transform results to structured JSON format
          const searchResults: SearchResult[] = topResults.map((r, index) => {
            // Extract title from text (format: "title\n\ndescription...")
            const titleMatch = r.text.split('\n')[0] || r.id;
            const libraryId = r.sourceId ? `/${r.sourceId}` : r.id;
            const config = getDocUrlConfig(libraryId);
            const docUrl = config ? generateDocumentationUrl(libraryId, '', r.text, config) : null;
            
            return {
              id: r.id,
              title: titleMatch || r.id,
              url: docUrl || `#${r.id}`,
              snippet: r.text ? r.text.substring(0, 200) + '...' : '',
              score: r.finalScore,
              metadata: {
                source: r.sourceId || 'sap-docs',
                library: r.sourceId,
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
          
          // Transform community search results to structured format
          const communityResults: SearchResult[] = res.results.map((r, index) => ({
            id: r.id || `community-${index}`,
            title: r.title || 'SAP Community Post',
            url: r.url || `#${r.id}`,
            snippet: r.description ? r.description.substring(0, 200) + '...' : '',
            metadata: {
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
        const { library_id, topic = "" } = args as { 
          library_id: string; 
          topic?: string; 
        };
        
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
          
          // Transform document content to structured format
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
          
          // Transform SAP Help search results to structured format
          const helpResults: SearchResult[] = res.results.map((r, index) => ({
            id: r.id || `sap-help-${index}`,
            title: r.title || 'SAP Help Document',
            url: r.url || `#${r.id}`,
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
