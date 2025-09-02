/**
 * Base Server Handler - Shared functionality for MCP servers
 * Eliminates code duplication between stdio and HTTP server implementations
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
            description: "Unified search across all SAP documentation sources including ABAP Keyword Documentation, UI5, CAP, testing frameworks, and development tools. Covers official ABAP language reference (multiple versions), SAPUI5 documentation, CAP documentation, wdi5 testing framework, OpenUI5 control APIs, UI5 Tooling, Cloud SDK, and more. Automatically detects ABAP versions from queries (e.g., 'LOOP 7.57' searches ABAP 7.57, 'SELECT latest' searches latest ABAP). Defaults to ABAP 7.58 for version-less ABAP queries.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "What to search for. Examples: 'button' (finds UI5 Button controls), 'wizard' (finds UI5/CAP docs), 'annotation' (finds annotation docs), 'wdi5' (finds testing docs), 'ABAP SELECT statements' (finds ABAP docs), 'inline declarations' (finds ABAP syntax), 'LOOP 7.57' (auto-detects version 7.57), 'exception handling latest' (searches latest ABAP version). Supports ABAP version auto-detection from queries containing versions like '7.52', '7.53', '7.54', '7.55', '7.56', '7.57', '7.58', or 'latest'. Defaults to ABAP 7.58 for version-less ABAP queries."
                }
              },
              required: ["query"]
            }
          },
          {
            name: "sap_community_search",
            description: "Search the SAP Community for blog posts, discussions, and solutions related to SAPUI5 and CAP development. Returns real-time results from the SAP Community with links to the original content and IDs for retrieving full posts. Results include engagement data (kudos) when available and follow SAP Community's 'Best Match' ranking.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "What to search for in the SAP Community. Examples: 'wizard implementation', 'button best practices', 'authentication', 'deployment', 'fiori elements', or any SAP development topic. Searches both post titles and content for comprehensive results."
                }
              },
              required: ["query"]
            }
          },
          {
            name: "sap_docs_get",
            description: "Retrieve specific SAP documentation, UI5 control API details, wdi5 testing docs, or SAP Community posts. Use the IDs returned from sap_docs_search or sap_community_search to get full content. Works with library IDs, document IDs, and community post IDs (e.g., 'community-12345').",
            inputSchema: {
              type: "object",
              properties: {
                library_id: {
                  type: "string",
                  description: "Library or document ID from sap_docs_search results. Can be a library ID like '/sapui5', '/cap', '/wdi5', '/openui5-api', '/ui5-typescript', '/abap-cheat-sheets', '/sap-styleguides', '/abap-fiori-showcase', '/cap-fiori-showcase' for general docs, '/abap-docs-758', '/abap-docs-757', '/abap-docs-756', '/abap-docs-755', '/abap-docs-754', '/abap-docs-753', '/abap-docs-752', '/abap-docs-latest' for ABAP documentation by version, or a specific document ID like '/openui5-api/sap/m/Button' or '/abap-docs-758/abeninline_declarations' for detailed documentation. For community posts, use IDs like 'community-12345' from sap_community_search results."
                },
                topic: {
                  type: "string",
                  description: "Optional topic filter to narrow down results within a library. Examples: 'properties', 'events', 'methods', 'aggregations', 'routing', 'authentication', 'annotations', 'testing', 'locators', 'pageObjects'. Most useful with library IDs rather than specific document IDs."
                }
              },
              required: ["library_id"]
            }
          },
          {
            name: "sap_help_search",
            description: "Search the SAP Help Portal using private APIs. This searches across all SAP Help documentation including product guides, implementation guides, and technical documentation. Returns real-time results from help.sap.com with IDs for retrieving full content.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "What to search for in SAP Help Portal. Examples: 'S/4HANA configuration', 'Fiori Launchpad setup', 'BTP integration', 'ABAP development', 'SAP Analytics Cloud', or any SAP product or technical topic. Searches across all SAP Help content."
                }
              },
              required: ["query"]
            }
          },
          {
            name: "sap_help_get",
            description: "Retrieve the full content of a specific SAP Help page. Use the IDs returned from sap_help_search to get the complete documentation page content. This uses the private SAP Help APIs to fetch metadata and page content.",
            inputSchema: {
              type: "object",
              properties: {
                result_id: {
                  type: "string",
                  description: "The ID from sap_help_search results (e.g., 'sap-help-12345abc'). This ID is used to fetch the complete page content including metadata."
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
                  text: `No results found for "${query}". Try searching for UI5 controls like 'button', 'table', 'wizard', testing topics like 'wdi5', 'testing', 'e2e', or concepts like 'routing', 'annotation', 'authentication', 'fiori elements', 'rap'. For detailed ABAP language syntax, use abap_search instead.`
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
                    text: res.error || `No results found for "${query}". Try searching for UI5 controls like 'button', 'table', 'wizard', testing topics like 'wdi5', 'testing', 'e2e', or concepts like 'routing', 'annotation', 'authentication', 'fiori elements', 'rap'. For detailed ABAP language syntax, use abap_search instead.`
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
                  text: `Search service temporarily unavailable. Please try again later. Error ID: ${timing.requestId}`
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
