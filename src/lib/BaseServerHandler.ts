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

        ]
      };
    });

    // Handle tool execution
    srv.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const clientMetadata = extractClientMetadata(request);

      if (name === "sap_docs_search") {
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
            return {
              content: [
                {
                  type: "text",
                  text: `No results for "${query}".

TRY INSTEAD:
• UI5 controls: "button", "table", "wizard"  
• CAP topics: "actions", "authentication", "media", "binary"
• Testing: "wdi5", "locators", "e2e"
• ABAP: Use version numbers like "SELECT 7.58"
• Errors: Include error codes like "415 error CAP action"`
                }
              ]
            };
          }
          
          // Format results similar to original response
          const formattedResults = topResults.map((r, index) => {
            return formatSearchResult(r, CONFIG.EXCERPT_LENGTH_MAIN, {
              generateDocumentationUrl,
              getDocUrlConfig
            });
          }).join('\n');
          
          const summary = `Found ${topResults.length} results for '${query}':\n\n${formattedResults}`;
          
          logger.logToolSuccess(name, timing.requestId, timing.startTime, topResults.length, { fallback: false });
          
          return {
            content: [
              {
                type: "text",
                text: summary
              }
            ]
          };
        } catch (error) {
          logger.logToolError(name, timing.requestId, timing.startTime, error, false);
          logger.info('Attempting fallback to original search after hybrid search failure');
          
          // Fallback to original search
          try {
            const res: SearchResponse = await searchLibraries(query);
            
            if (!res.results.length) {
              logger.logToolSuccess(name, timing.requestId, timing.startTime, 0, { fallback: true });
              return {
                content: [
                  {
                    type: "text",
                    text: res.error || `No results for "${query}".

TRY INSTEAD:
• UI5 controls: "button", "table", "wizard"  
• CAP topics: "actions", "authentication", "media", "binary"
• Testing: "wdi5", "locators", "e2e"
• ABAP: Use version numbers like "SELECT 7.58"
• Errors: Include error codes like "415 error CAP action"`
                  }
                ]
              };
            }
            
            logger.logToolSuccess(name, timing.requestId, timing.startTime, res.results.length, { fallback: true });
            
            return {
              content: [
                {
                  type: "text",
                  text: res.results[0].description
                }
              ]
            };
          } catch (fallbackError) {
            logger.logToolError(name, timing.requestId, timing.startTime, fallbackError, true);
            return {
              content: [
                {
                  type: "text",
                  text: `Search temporarily unavailable. 

NEXT STEPS:
• Wait 30 seconds and retry
• Try sap_community_search instead
• Use more specific search terms
• Error ID: ${timing.requestId}`
                }
              ]
            };
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
            return {
              content: [
                {
                  type: "text",
                  text: res.error || `No SAP Community posts found for "${query}". Try different keywords or check your connection.`
                }
              ]
            };
          }
          
          logger.logToolSuccess(name, timing.requestId, timing.startTime, res.results.length);
          
          return {
            content: [
              {
                type: "text",
                text: res.results[0].description
              }
            ]
          };
        } catch (error) {
          logger.logToolError(name, timing.requestId, timing.startTime, error);
          return {
            content: [
              {
                type: "text",
                text: `SAP Community search service temporarily unavailable. Please try again later. Error ID: ${timing.requestId}`
              }
            ]
          };
        }
      }

      if (name === "sap_docs_get") {
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
            return {
              content: [
                {
                  type: "text",
                  text: `Nothing found for ${library_id}`
                }
              ]
            };
          }
          
          logger.logToolSuccess(name, timing.requestId, timing.startTime, 1, { 
            contentLength: text.length,
            libraryId: library_id,
            topic: topic || undefined
          });
          
          return { content: [{ type: "text", text }] };
        } catch (error) {
          logger.logToolError(name, timing.requestId, timing.startTime, error);
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving documentation for ${library_id}. Please try again later. Error ID: ${timing.requestId}`
              }
            ]
          };
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
            return {
              content: [
                {
                  type: "text",
                  text: res.error || `No SAP Help results found for "${query}". Try different keywords or check your connection.`
                }
              ]
            };
          }
          
          logger.logToolSuccess(name, timing.requestId, timing.startTime, res.results.length);
          
          return {
            content: [
              {
                type: "text",
                text: res.results[0].description
              }
            ]
          };
        } catch (error) {
          logger.logToolError(name, timing.requestId, timing.startTime, error);
          return {
            content: [
              {
                type: "text",
                text: `SAP Help search service temporarily unavailable. Please try again later. Error ID: ${timing.requestId}`
              }
            ]
          };
        }
      }

      if (name === "sap_help_get") {
        const { result_id } = args as { result_id: string };
        
        // Enhanced logging with timing
        const timing = logger.logToolStart(name, result_id, clientMetadata);
        
        try {
          const content = await getSapHelpContent(result_id);
          
          logger.logToolSuccess(name, timing.requestId, timing.startTime, 1, { 
            contentLength: content.length,
            resultId: result_id
          });
          
          return {
            content: [
              {
                type: "text",
                text: content
              }
            ]
          };
        } catch (error) {
          logger.logToolError(name, timing.requestId, timing.startTime, error);
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving SAP Help content. Please try again later. Error ID: ${timing.requestId}`
              }
            ]
          };
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
