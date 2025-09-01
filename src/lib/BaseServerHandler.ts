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
import { 
  searchAbapDocs, 
  getAbapDoc, 
  getAvailableVersions 
} from "./abapDocs.js";
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
            description: "Search across SAP documentation sources including UI5, CAP, testing frameworks, and development tools. Covers SAPUI5 documentation, CAP documentation, wdi5 testing framework, OpenUI5 control APIs, UI5 Tooling, Cloud SDK, and more. Use this for general SAP development topics, UI5 controls, CAP concepts, and testing frameworks. For comprehensive ABAP language syntax and official keyword documentation, use abap_search instead.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "What to search for. Examples: 'button' (finds UI5 Button controls), 'wizard' (finds Wizard controls and docs), 'annotation' (finds annotation docs across CAP/UI5), 'wdi5' (finds testing framework docs), 'testing' (finds testing and automation docs), 'routing', 'authentication', 'table', 'odata', 'fiori elements', 'cds', 'rap', 'clean code', 'typescript'. For ABAP language syntax, use abap_search instead."
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
                  description: "Library or document ID from sap_docs_search results. Can be a library ID like '/sapui5', '/cap', '/wdi5', '/openui5-api', '/ui5-typescript', '/abap-cheat-sheets', '/sap-styleguides', '/abap-fiori-showcase', '/cap-fiori-showcase' for general docs, or a specific document ID like '/openui5-api/sap/m/Button' for detailed control API documentation. For community posts, use IDs like 'community-12345' from sap_community_search results."
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
          {
            name: "abap_search",
            description: "Search the official ABAP Keyword Documentation across multiple ABAP versions for comprehensive language syntax and programming concepts. This is the authoritative source for ABAP language constructs, statements, and official documentation. Use this for detailed ABAP syntax, language features, and official SAP documentation. For ABAP examples, best practices, and community guidelines, use sap_docs_search instead.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "What to search for in official ABAP documentation. Examples: 'SELECT statements', 'internal tables', 'object orientation', 'exception handling', 'function modules', 'classes', 'methods', 'data types', 'ABAP SQL', 'CDS views', 'LOOP statements', 'IF conditions', 'TRY CATCH', or any ABAP language construct."
                },
                version: {
                  type: "string",
                  description: "ABAP version to search in. Examples: '7.58', '7.57', '7.56', 'latest'. Defaults to '7.58' if not specified."
                },
                limit: {
                  type: "number",
                  description: "Maximum number of results to return. Defaults to 10 if not specified."
                }
              },
              required: ["query"]
            }
          },
          {
            name: "abap_get",
            description: "Retrieve the full content of a specific ABAP documentation bundle from the official ABAP Keyword Documentation. Use the IDs returned from abap_search to get the complete bundled documentation content. Each bundle combines multiple related ABAP documentation pages for comprehensive coverage of a topic.",
            inputSchema: {
              type: "object",
              properties: {
                doc_id: {
                  type: "string",
                  description: "The ID from abap_search results (e.g., 'abap-7.58-bundles-abap-keyword-documentation-...'). This ID is used to fetch the complete bundled documentation content."
                },
                version: {
                  type: "string", 
                  description: "ABAP version for the documentation. Defaults to '7.58' if not specified."
                }
              },
              required: ["doc_id"]
            }
          }
        ]
      };
    });

    // Handle tool execution
    srv.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const clientMetadata = extractClientMetadata(request);

      if (name === "sap_docs_search") {
        const { query } = args as { query: string };
        
        // Log the search request with client metadata
        logger.logRequest(name, query, clientMetadata);
        
        try {
          // Use hybrid search with reranking
          const results = await search(query, { 
            k: CONFIG.RETURN_K 
          });
          
          const topResults = results;
          
          if (topResults.length === 0) {
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
          
          return {
            content: [
              {
                type: "text",
                text: summary
              }
            ]
          };
        } catch (error) {
          logger.error('Hybrid search failed, falling back to original search:', { error: String(error) });
          // Fallback to original search
          const res: SearchResponse = await searchLibraries(query);
          
          if (!res.results.length) {
            return {
              content: [
                {
                  type: "text",
                  text: res.error || `No results found for "${query}". Try searching for UI5 controls like 'button', 'table', 'wizard', testing topics like 'wdi5', 'testing', 'e2e', or concepts like 'routing', 'annotation', 'authentication', 'fiori elements', 'rap'. For detailed ABAP language syntax, use abap_search instead.`
                }
              ]
            };
          }
          
          return {
            content: [
              {
                type: "text",
                text: res.results[0].description
              }
            ]
          };
        }
      }

      if (name === "sap_community_search") {
        const { query } = args as { query: string };
        
        // Log the community search request
        logger.logRequest(name, query, clientMetadata);
        
        const res: SearchResponse = await searchCommunity(query);
        
        if (!res.results.length) {
          return {
            content: [
              {
                type: "text",
                text: res.error || `No SAP Community posts found for "${query}". Try different keywords or check your connection.`
              }
            ]
          };
        }
        
        return {
          content: [
            {
              type: "text",
              text: res.results[0].description
            }
          ]
        };
      }

      if (name === "sap_docs_get") {
        const { library_id, topic = "" } = args as { 
          library_id: string; 
          topic?: string; 
        };
        
        // Log the docs get request
        logger.logRequest(name, library_id + (topic ? `/${topic}` : ''), clientMetadata);
        
        const text = await fetchLibraryDocumentation(library_id, topic);
        
        if (!text) {
          return {
            content: [
              {
                type: "text",
                text: `Nothing found for ${library_id}`
              }
            ]
          };
        }
        
        return { content: [{ type: "text", text }] };
      }

      if (name === "sap_help_search") {
        const { query } = args as { query: string };
        
        // Log the SAP Help search request
        logger.logRequest(name, query, clientMetadata);
        
        const res: SearchResponse = await searchSapHelp(query);
        
        if (!res.results.length) {
          return {
            content: [
              {
                type: "text",
                text: res.error || `No SAP Help results found for "${query}". Try different keywords or check your connection.`
              }
            ]
          };
        }
        
        return {
          content: [
            {
              type: "text",
              text: res.results[0].description
            }
          ]
        };
      }

      if (name === "sap_help_get") {
        const { result_id } = args as { result_id: string };
        
        // Log the SAP Help get request
        logger.logRequest(name, result_id, clientMetadata);
        
        try {
          const content = await getSapHelpContent(result_id);
          
          return {
            content: [
              {
                type: "text",
                text: content
              }
            ]
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving SAP Help content: ${error.message}`
              }
            ]
          };
        }
      }

      if (name === "abap_search") {
        const { query, version = '7.58', limit = 10 } = args as { 
          query: string; 
          version?: string; 
          limit?: number; 
        };
        
        // Log the ABAP search request
        logger.logRequest(name, query, clientMetadata);
        
        try {
          const results = await searchAbapDocs(query, version, limit);
          
          if (results.results.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No ABAP documentation found for "${query}" in version ${version}. Try searching for ABAP language concepts like 'SELECT statements', 'internal tables', 'classes', 'methods', 'exception handling', or 'data types'.`
                }
              ]
            };
          }
          
          // Format results similar to other search tools
          const formattedResults = results.results.map((result, index) => {
            return `⭐️ **${result.id}** (Score: ${result.score.toFixed(2)})
   ${result.title} (ABAP ${result.version})
   ${result.preview}
   Use in abap_get`;
          }).join('\n\n');
          
          const summary = `Found ${results.results.length} ABAP documentation bundles for '${query}' (version ${version}):\n\n${formattedResults}`;
          
          return {
            content: [
              {
                type: "text",
                text: summary
              }
            ]
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: "text",
                text: `Error searching ABAP documentation: ${error.message}`
              }
            ]
          };
        }
      }

      if (name === "abap_get") {
        const { doc_id, version = '7.58' } = args as { 
          doc_id: string; 
          version?: string; 
        };
        
        // Log the ABAP get request
        logger.logRequest(name, doc_id, clientMetadata);
        
        try {
          const content = await getAbapDoc(doc_id, version);
          
          if (!content) {
            return {
              content: [
                {
                  type: "text",
                  text: `ABAP documentation not found for ID: ${doc_id}. Use abap_search first to get valid document IDs.`
                }
              ]
            };
          }
          
          return {
            content: [
              {
                type: "text",
                text: content
              }
            ]
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving ABAP documentation: ${error.message}`
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
