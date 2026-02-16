/**
 * Base Server Handler - ABAP/RAP-focused MCP server
 * Provides unified search across ABAP documentation resources for ADT (Eclipse) usage
 * 
 * IMPORTANT FOR LLMs/AI ASSISTANTS:
 * =================================
 * This MCP server provides tools for ABAP/RAP development:
 * - search: Unified search across ABAP documentation (offline + optional online)
 * - fetch: Retrieve full document content
 * - abap_lint: Local ABAP code linting
 * - abap_feature_matrix: Check ABAP feature availability across SAP releases (Software Heroes)
 * 
 * The function names may appear with different prefixes depending on your MCP client:
 * - Simple names: search, fetch, abap_lint, abap_feature_matrix
 * - Prefixed names: mcp_abap-community-mcp-server_search, etc.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import {
  searchLibraries,
  fetchLibraryDocumentation,
  readDocumentationResource
} from "./localDocs.js";
import { lintAbapCode, LintResult } from "./abaplint.js";
import { searchFeatureMatrix, SearchFeatureMatrixResult, getFeatureMatrixCacheStats } from "./softwareHeroes/index.js";

import { SearchResponse } from "./types.js";
import { logger } from "./logger.js";
import { search } from "./search.js";
import { CONFIG } from "./config.js";
import { loadMetadata, getDocUrlConfig } from "./metadata.js";
import { generateDocumentationUrl, formatSearchResult } from "./url-generation/index.js";
import { isToolEnabled, getVariantName } from "./variant.js";

/**
 * Helper functions for creating structured JSON responses compatible with ChatGPT and all MCP clients
 */

interface SearchResult {
  id: string;
  title: string;
  url: string;
  library_id?: string;
  topic?: string;
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
    library_id: result.library_id,
    topic: result.topic,
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
    ],
    structuredContent: { results: cleanedResults }
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
    ],
    structuredContent: cleanedDocument
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
    ],
    structuredContent: {
      error,
      requestId: requestId || 'unknown'
    }
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
 * Provides ABAP/RAP-focused MCP server functionality for ADT (Eclipse) usage
 */
export class BaseServerHandler {
  
  /**
   * Configure server with tool handlers
   */
  static configureServer(srv: Server): void {
    this.setupToolHandlers(srv);

    const capabilities = (srv as unknown as { _capabilities?: { prompts?: object; resources?: object } })._capabilities;
    if (capabilities?.prompts) {
      this.setupPromptHandlers(srv);
    }
    if (capabilities?.resources) {
      this.setupResourceHandlers(srv);
    }
  }

  /**
   * Setup tool handlers for ABAP/RAP-focused MCP server
   */
  private static setupToolHandlers(srv: Server): void {
    // List available tools
    srv.setRequestHandler(ListToolsRequestSchema, async () => {
      const response = {
        tools: [
          {
            name: "search",
            description: `SEARCH ABAP/RAP DOCUMENTATION: search(query="search terms")

FUNCTION NAME: search

Unified search for ABAP + RAP development documentation. It searches across curated OFFLINE sources (fast, deterministic) and can also include ONLINE sources (best-effort, 10s timeout per source) when enabled.

Use this to discover the best document IDs, then call \`fetch(id=...)\` to retrieve full content.

SOURCES OVERVIEW

OFFLINE sources (local FTS index; always searched unless filtered via \`sources\`):
Reference & guidance (not sample-heavy):
• abap-docs-standard (offline): Official ABAP Keyword Documentation for on‑premise systems (full syntax). Best for statement syntax + semantics.
• abap-docs-cloud (offline): Official ABAP Keyword Documentation for ABAP Cloud/BTP (restricted syntax). Best for Steampunk/BTP constraints.
• sap-styleguides (offline): SAP Clean ABAP Style Guide + best practices (includes translations; non‑English duplicates are filtered).
• dsag-abap-leitfaden (offline): DSAG ABAP Leitfaden (German) with ABAP development guidelines and best practices.

Sample-heavy OFFLINE sources (controlled by \`includeSamples\`; great for implementation, can dominate broad queries):
• abap-cheat-sheets (offline, samples): Many practical ABAP/RAP snippets; quick “how-to” reference.
• abap-fiori-showcase (offline, samples): Annotation-driven RAP + OData V4 + Fiori Elements feature showcase.
• abap-platform-rap-opensap (offline, samples): openSAP “Building Apps with RAP” course samples (ABAP/CDS).
• cloud-abap-rap (offline, samples): ABAP Cloud + RAP example projects (ABAP/CDS).
• abap-platform-reuse-services (offline, samples): RAP reuse services examples (number ranges, change documents, mail, Adobe Forms, ...).

OPTIONAL ONLINE SOURCES (when includeOnline=true):
• sap-help (online): SAP Help Portal product documentation (official, broad scope).
• sap-community (online): SAP Community blogs + Q&A + troubleshooting (practical, quality varies).
• software-heroes (online): Software Heroes ABAP/RAP articles & tutorials (searched in EN+DE, deduplicated by URL; feed search is disabled).

NOTE ABOUT \`abapFlavor\`:
• This primarily affects the OFFICIAL ABAP Keyword Documentation sources (abap-docs-standard vs abap-docs-cloud). Other sources are kept.

PARAMETERS:
• query (required): Search terms. Be specific and use technical ABAP/RAP terminology.
• k (optional, default=50): Number of results to return.
• includeOnline (optional, default=true): Keep this ON for best answers. Only set to false if online search is blocked/slow/unreliable in your environment OR you explicitly want OFFLINE-only sources.
• includeSamples (optional, default=true): Includes sample-heavy offline sources (repos, showcases, cheat sheets). If results are flooded by examples and you want more conceptual/reference docs, set to false. Turn it on when you want implementation/code.
• abapFlavor (optional, default="auto"): Filter by ABAP flavor:
  - "standard": Only Standard ABAP (on-premise, full syntax)
  - "cloud": Only ABAP Cloud (BTP, restricted syntax)
  - "auto": Detect from query (add "cloud" or "btp" for cloud, otherwise standard)
• sources (optional): Restrict OFFLINE search to specific source IDs (does not disable online sources; use includeOnline for that).
  Example: ["abap-docs-standard", "sap-styleguides"]

RETURNS (JSON array of results, each containing):
• id: Document identifier (use with fetch to get full content)
• title: Document title
• url: Link to documentation
• snippet: Text excerpt from document
• score: Relevance score (RRF-fused from multiple sources)
• library_id: Source library identifier
• metadata.source: Source ID (abap-docs-standard, sap-help, etc.)
• metadata.sourceKind: "offline" | "sap_help" | "sap_community" | "software_heroes"

TYPICAL WORKFLOW:
1. search(query="your ABAP/RAP question")
2. fetch(id="result_id_from_step_1") to get full content

QUERY TIPS:
• Be specific: "RAP behavior definition" not just "RAP"
• Include ABAP keywords: "SELECT FOR ALL ENTRIES", "LOOP AT GROUP BY"
• For ABAP Cloud: Add "cloud" or "btp" to query, or set abapFlavor="cloud"
• For OFFLINE-only: Set includeOnline=false (use this mainly when online search does not work for you)
• If results are too code-heavy: Set includeSamples=false
• For implementation examples: Keep includeSamples=true`,
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search terms for ABAP/RAP documentation. Be specific and use technical terms."
                },
                k: {
                  type: "number",
                  description: "Number of results to return. Default: 50.",
                  default: 50,
                  minimum: 1,
                  maximum: 100
                },
                includeOnline: {
                  type: "boolean",
                  description: "Include online sources (SAP Help, SAP Community, Software Heroes). Default: true. Only turn off if online search is blocked/slow/unreliable or you explicitly want offline-only sources.",
                  default: true
                },
                includeSamples: {
                  type: "boolean",
                  description: "Include sample-heavy offline sources (cheat sheets, showcases, example repos). Default: true. Turn off if you want fewer code examples and more reference/guidance docs.",
                  default: true
                },
                abapFlavor: {
                  type: "string",
                  enum: ["standard", "cloud", "auto"],
                  description: "Filter by ABAP flavor: 'standard' (on-premise), 'cloud' (BTP), or 'auto' (detect from query). Default: auto.",
                  default: "auto"
                },
                sources: {
                  type: "array",
                  items: { type: "string" },
                  description: "Optional: specific source IDs to search. If not provided, searches all ABAP sources."
                }
              },
              required: ["query"]
            },
            outputSchema: {
              type: "object",
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      url: { type: "string" },
                      library_id: { type: "string" },
                      topic: { type: "string" },
                      snippet: { type: "string" },
                      score: { type: "number" },
                      metadata: { type: "object", additionalProperties: true }
                    },
                    required: ["id", "title", "url"],
                    additionalProperties: true
                  }
                }
              },
              required: ["results"],
              additionalProperties: true
            }
          },
          {
            name: "fetch",
            description: `GET FULL DOCUMENT CONTENT: fetch(id="result_id")

FUNCTION NAME: fetch

Retrieves the full content of a document from search results.

USAGE:
1. First use search() to find relevant documents
2. Use the 'id' from search results to fetch full content
3. Returns complete document text with metadata

PARAMETERS:
• id (required): Document ID from search results. Use the exact ID returned by search.

RETURNS:
• id: Document identifier
• title: Document title
• text: Full document content (markdown or code)
• url: Link to online documentation (if available)
• metadata: Source information and content details`,
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Document ID from search results. Use exact IDs returned by search.",
                  examples: [
                    "/abap-docs-standard/abapselect",
                    "/abap-docs-cloud/abaploop",
                    "/abap-cheat-sheets/rap",
                    "/sap-styleguides/clean-abap"
                  ]
                }
              },
              required: ["id"]
            },
            outputSchema: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                text: { type: "string" },
                url: { type: "string" },
                metadata: { type: "object", additionalProperties: true }
              },
              required: ["id", "title", "text", "url"],
              additionalProperties: true
            }
          },
          {
            name: "abap_lint",
            description: `LINT ABAP CODE: abap_lint(code="DATA lv_test TYPE string.")

FUNCTION NAME: abap_lint

Runs static code analysis on ABAP source code using abaplint.
Pass ABAP code directly as a string - no files needed.

LIMITS:
• Maximum code size: 50KB - larger code will be rejected
• Execution timeout: 10 seconds - complex code may timeout

HOW IT WORKS:
1. Pass ABAP source code as a string
2. The tool automatically detects the ABAP file type from the code content
3. Returns structured findings with line numbers, messages, and severity

AUTO-DETECTION (no filename needed):
The tool automatically detects the correct file type from code patterns:
• CLASS ... DEFINITION -> .clas.abap
• INTERFACE ... -> .intf.abap
• FUNCTION-POOL / FUNCTION -> .fugr.abap
• REPORT / PROGRAM -> .prog.abap
• TYPE-POOL -> .type.abap
• DEFINE VIEW / CDS -> .ddls.asddls
• DEFINE BEHAVIOR -> .bdef.asbdef
• DEFINE ROLE -> .dcls.asdcls
• Code snippets without clear type -> .clas.abap (default, enables most rules)

PARAMETERS:
• code (required): ABAP source code to analyze as a string (max 50KB)
• filename (optional): Override auto-detection with explicit filename (e.g., "test.clas.abap"). Only needed if auto-detection fails for unusual code patterns.
• version (optional): ABAP version - "Cloud" (default) or "Standard"

RETURNS JSON with:
• findings: Array of lint issues, each containing:
  - line: Line number where issue starts
  - column: Column number where issue starts  
  - endLine: Line number where issue ends
  - endColumn: Column number where issue ends
  - message: Description of the issue
  - severity: "error" | "warning" | "info"
  - ruleKey: abaplint rule identifier (e.g., "unused_variables", "keyword_case")
• errorCount: Total errors found
• warningCount: Total warnings found
• infoCount: Total info messages found
• success: Boolean indicating if lint completed successfully
• error: Error message if lint failed (includes size/timeout errors)

EXAMPLE:
abap_lint(code="CLASS zcl_test DEFINITION PUBLIC.\\n  PUBLIC SECTION.\\n    DATA: lv_unused TYPE string.\\nENDCLASS.")

RULES CHECKED:
• Syntax errors and unknown types
• Unused variables and unreachable code
• ABAP Cloud compatibility (obsolete statements)
• Naming conventions (classes, variables, methods)
• Code style (indentation, line length, keyword case)
• Best practices (prefer XSDBOOL, use NEW, etc.)

USE CASES:
• Validate code snippets before implementing
• Check code for ABAP Cloud compatibility  
• Find syntax errors and best practice violations
• Review generated or suggested code`,
            inputSchema: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  description: "ABAP source code to analyze (max 50KB)"
                },
                filename: {
                  type: "string",
                  description: "Optional: Override auto-detection with explicit filename (e.g., 'myclass.clas.abap'). Usually not needed - the tool auto-detects file type from code content."
                },
                version: {
                  type: "string",
                  enum: ["Cloud", "Standard"],
                  description: "ABAP version for linting rules. 'Cloud' (default) checks for BTP/Steampunk compatibility.",
                  default: "Cloud"
                }
              },
              required: ["code"]
            },
            outputSchema: {
              type: "object",
              properties: {
                findings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      line: { type: "number" },
                      column: { type: "number" },
                      endLine: { type: "number" },
                      endColumn: { type: "number" },
                      message: { type: "string" },
                      severity: { type: "string", enum: ["error", "warning", "info"] },
                      ruleKey: { type: "string" }
                    },
                    required: ["line", "column", "message", "severity", "ruleKey"],
                    additionalProperties: true
                  }
                },
                errorCount: { type: "number" },
                warningCount: { type: "number" },
                infoCount: { type: "number" },
                success: { type: "boolean" },
                error: { type: "string" }
              },
              required: ["findings", "errorCount", "warningCount", "infoCount", "success"],
              additionalProperties: true
            }
          },
          {
            name: "abap_feature_matrix",
            description: `ABAP FEATURE MATRIX: abap_feature_matrix(query="feature keywords")

FUNCTION NAME: abap_feature_matrix

Search the Software Heroes ABAP Feature Matrix to check feature availability across SAP releases.
The matrix shows which ABAP features are available in different SAP releases (7.40, 7.50, 7.52, 7.54, 7.55, 7.56, 7.57, 2020, 2021, 2022, 2023, LATEST).

DATA SOURCE: https://software-heroes.com/en/abap-feature-matrix
Full matrix is fetched in English and cached for 24 hours. Filtering is done locally.

STATUS MARKERS:
• ✅ available - Feature is available in the release
• ❌ unavailable - Feature is not available
• ⭕ deprecated - Feature is deprecated
• ❔ needs_review - Status needs verification
• 🔽 downport - Feature was backported from a newer release

PARAMETERS:
• query (optional): Feature keywords to search for (e.g., "inline declaration", "CORRESPONDING", "mesh"). If empty, returns all features.
• limit (optional): Maximum number of results. If not specified, returns all matching features.

RETURNS JSON with:
• matches: Array of matching features with:
  - feature: Feature name
  - section: Category (e.g., "ABAP SQL", "ABAP Statements")
  - link: URL to more information (if available)
  - statusByRelease: Object mapping release versions to status
  - score: Relevance score
• meta: Matrix metadata (totalFeatures, totalSections, sections)
• sourceUrl: Attribution URL to Software Heroes
• legend: Explanation of status markers

EXAMPLES:
abap_feature_matrix(query="inline declaration")
abap_feature_matrix(query="CORRESPONDING")
abap_feature_matrix() - returns all features
abap_feature_matrix(query="CDS", limit=10)

USE CASES:
• Check if a feature is available in your target SAP release
• Find when a specific ABAP feature was introduced
• Compare feature availability across releases
• Get full matrix and let LLM interpret/filter results`,
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Feature keywords to search for. If empty or not provided, returns all features."
                },
                limit: {
                  type: "number",
                  description: "Maximum number of results. If not specified, returns all matching features.",
                  minimum: 1
                }
              },
              required: []
            },
            outputSchema: {
              type: "object",
              properties: {
                matches: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      feature: { type: "string" },
                      section: { type: "string" },
                      link: { type: "string" },
                      statusByRelease: { type: "object", additionalProperties: { type: "string" } },
                      score: { type: "number" }
                    },
                    required: ["feature", "section", "statusByRelease", "score"],
                    additionalProperties: true
                  }
                },
                meta: {
                  type: "object",
                  properties: {
                    totalFeatures: { type: "number" },
                    totalSections: { type: "number" },
                    sections: { type: "array", items: { type: "string" } }
                  },
                  additionalProperties: true
                },
                sourceUrl: { type: "string" },
                legend: { type: "object", additionalProperties: { type: "string" } }
              },
              required: ["matches", "meta", "sourceUrl", "legend"],
              additionalProperties: true
            }
          }
        ]
      };

      if (!isToolEnabled("abapLint")) {
        response.tools = response.tools.filter((tool) => tool.name !== "abap_lint");
      }

      return response;
    });

    // Handle tool execution
    srv.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const clientMetadata = extractClientMetadata(request);

      if (name === "search") {
        // Extract all parameters with defaults
        const { 
          query,
          k,
          includeOnline = true,  // Online search enabled by default
          includeSamples = true,
          abapFlavor = 'auto',
          sources
        } = args as { 
          query: string;
          k?: number;
          includeOnline?: boolean;
          includeSamples?: boolean;
          abapFlavor?: 'standard' | 'cloud' | 'auto';
          sources?: string[];
        };
        
        // Validate and constrain k parameter (max 100 results)
        const resultCount = Math.min(Math.max(k || CONFIG.RETURN_K, 1), 100);
        
        // Enhanced logging with timing
        const timing = logger.logToolStart(name, query, clientMetadata);
        
        // DEBUG: Log all input parameters
        console.log(`\n🔍 [SEARCH TOOL] ========================================`);
        console.log(`🔍 [SEARCH TOOL] Query: "${query}"`);
        console.log(`🔍 [SEARCH TOOL] Parameters: k=${resultCount}, includeOnline=${includeOnline}, includeSamples=${includeSamples}, abapFlavor=${abapFlavor}`);
        console.log(`🔍 [SEARCH TOOL] Sources filter: ${sources ? sources.join(', ') : 'all'}`);
        console.log(`🔍 [SEARCH TOOL] Request ID: ${timing.requestId}`);
        
        try {
          // Use unified search with all parameters
          console.log(`🔍 [SEARCH TOOL] Calling unified search...`);
          const searchStartTime = Date.now();
          
          const results = await search(query, { 
            k: resultCount,
            includeOnline,
            includeSamples,
            abapFlavor,
            sources
          });
          
          const searchDuration = Date.now() - searchStartTime;
          console.log(`🔍 [SEARCH TOOL] Search completed in ${searchDuration}ms`);
          
          const topResults = results;
          
          // DEBUG: Log result summary
          console.log(`🔍 [SEARCH TOOL] Results returned: ${topResults.length}`);
          if (topResults.length > 0) {
            // Count by sourceKind
            const sourceKindCounts: Record<string, number> = {};
            topResults.forEach(r => {
              const kind = r.sourceKind || 'unknown';
              sourceKindCounts[kind] = (sourceKindCounts[kind] || 0) + 1;
            });
            console.log(`🔍 [SEARCH TOOL] By sourceKind: ${JSON.stringify(sourceKindCounts)}`);
            
            // Log top 3 results for quick inspection
            console.log(`🔍 [SEARCH TOOL] Top 3 results:`);
            topResults.slice(0, 3).forEach((r, i) => {
              console.log(`   ${i+1}. [${r.sourceKind}] score=${r.finalScore?.toFixed(4)} id=${r.id.substring(0, 60)}...`);
            });
          }
          
          if (topResults.length === 0) {
            console.log(`⚠️ [SEARCH TOOL] No results found for query: "${query}"`);
            logger.logToolSuccess(name, timing.requestId, timing.startTime, 0, { fallback: false });
            return createErrorResponse(
              `No results for "${query}". Try ABAP keywords ("SELECT", "LOOP", "RAP"), add "cloud" for ABAP Cloud syntax, or be more specific.`,
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
            const docUrl = config ? generateDocumentationUrl(libraryId, r.relFile || '', r.text, config) : null;
            
            return {
              // ChatGPT-required format: id, title, url
              id: r.id,
              title: r.text.split('\n')[0] || r.id,
              url: docUrl || r.path || `#${r.id}`,
              // Additional fields
              library_id: libraryId,
              topic: topic,
              snippet: r.text ? r.text.substring(0, CONFIG.EXCERPT_LENGTH_MAIN) + '...' : '',
              score: r.finalScore,
              metadata: {
                source: r.sourceId || 'abap-docs',
                sourceKind: r.sourceKind || 'offline',
                library: libraryId,
                bm25Score: r.bm25,
                rank: index + 1
              }
            };
          });
          
          logger.logToolSuccess(name, timing.requestId, timing.startTime, topResults.length, { 
            includeOnline,
            includeSamples,
            abapFlavor
          });
          
          // DEBUG: Log output summary
          console.log(`🔍 [SEARCH TOOL] Returning ${searchResults.length} formatted results`);
          console.log(`🔍 [SEARCH TOOL] ========================================\n`);
          
          return createSearchResponse(searchResults);
        } catch (error) {
          logger.logToolError(name, timing.requestId, timing.startTime, error, false);
          logger.info('Attempting fallback to original search after unified search failure');
          
          // Fallback to original search (offline only)
          try {
            const res: SearchResponse = await searchLibraries(query);
            
            if (!res.results.length) {
              logger.logToolSuccess(name, timing.requestId, timing.startTime, 0, { fallback: true });
              return createErrorResponse(
                res.error || `No fallback results for "${query}". Try ABAP keywords ("SELECT", "LOOP", "RAP"), add "cloud" for ABAP Cloud syntax, or be more specific.`,
                timing.requestId
              );
            }
            
            // Transform fallback results to structured format
            const fallbackResults: SearchResult[] = res.results.map((r, index) => ({
              id: r.id || `fallback-${index}`,
              title: r.title || 'ABAP Documentation',
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
              `Search temporarily unavailable. Wait 30 seconds and retry, or use more specific search terms.`,
              timing.requestId
            );
          }
        }
      }

      if (name === "fetch") {
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
              source: 'abap-docs',
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

      if (name === "abap_lint") {
        if (!isToolEnabled("abapLint")) {
          const timing = logger.logToolStart(name, "disabled", clientMetadata);
          logger.logToolError(name, timing.requestId, timing.startTime, new Error("Tool disabled for this variant"));
          return createErrorResponse("Tool " + name + " is disabled for MCP variant " + getVariantName() + ".", timing.requestId);
        }
        const { code, filename, version } = args as { 
          code: string; 
          filename?: string;
          version?: "Cloud" | "Standard";
        };
        
        if (!code) {
          const timing = logger.logToolStart(name, 'missing_code', clientMetadata);
          logger.logToolError(name, timing.requestId, timing.startTime, new Error('Missing code parameter'));
          return createErrorResponse(
            `Missing required parameter: code. Please provide ABAP source code to lint.`,
            timing.requestId
          );
        }
        
        // Enhanced logging with timing (show first 50 chars of code)
        const codePreview = code.substring(0, 50).replace(/\n/g, ' ') + (code.length > 50 ? '...' : '');
        const timing = logger.logToolStart(name, codePreview, clientMetadata);
        
        try {
          const result: LintResult = await lintAbapCode(code, filename || 'code.abap', version || 'Cloud');
          
          logger.logToolSuccess(name, timing.requestId, timing.startTime, 1, {
            errorCount: result.errorCount,
            warningCount: result.warningCount,
            infoCount: result.infoCount
          });
          
          // Return structured JSON response
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result)
              }
            ],
            structuredContent: result
          };
        } catch (error) {
          logger.logToolError(name, timing.requestId, timing.startTime, error);
          return createErrorResponse(
            `Error running abaplint: ${error}`,
            timing.requestId
          );
        }
      }

      if (name === "abap_feature_matrix") {
        const { query, limit } = args as {
          query?: string;
          limit?: number;
        };

        // Query is now optional - empty string returns all features
        const searchQuery = query || '';

        // Enhanced logging with timing
        const timing = logger.logToolStart(name, searchQuery || '(all features)', clientMetadata);

        // Log cache stats for debugging
        const cacheStats = getFeatureMatrixCacheStats();
        console.log(`\n🔍 [ABAP_FEATURE_MATRIX] ========================================`);
        console.log(`🔍 [ABAP_FEATURE_MATRIX] Query: "${searchQuery || '(all features)'}"`);
        console.log(`🔍 [ABAP_FEATURE_MATRIX] Limit: ${limit || 'all'}`);
        console.log(`🔍 [ABAP_FEATURE_MATRIX] Cache: ${cacheStats.size} entries, TTL=${cacheStats.ttlHours}h`);
        console.log(`🔍 [ABAP_FEATURE_MATRIX] Request ID: ${timing.requestId}`);

        try {
          const searchStartTime = Date.now();

          const result: SearchFeatureMatrixResult = await searchFeatureMatrix({
            query: searchQuery,
            limit,
          });

          const searchDuration = Date.now() - searchStartTime;
          console.log(`🔍 [ABAP_FEATURE_MATRIX] Search completed in ${searchDuration}ms`);
          console.log(`🔍 [ABAP_FEATURE_MATRIX] Matches found: ${result.matches.length} of ${result.meta.totalFeatures} total features`);

          if (result.matches.length > 0) {
            console.log(`🔍 [ABAP_FEATURE_MATRIX] Top 3 matches:`);
            result.matches.slice(0, 3).forEach((m, i) => {
              console.log(`   ${i + 1}. [${m.section}] "${m.feature}" (score=${m.score})`);
            });
          }

          logger.logToolSuccess(name, timing.requestId, timing.startTime, result.matches.length, {
            totalFeatures: result.meta.totalFeatures,
            totalSections: result.meta.totalSections,
            sections: result.meta.sections,
          });

          console.log(`🔍 [ABAP_FEATURE_MATRIX] ========================================\n`);

          // Return structured JSON response
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result)
              }
            ],
            structuredContent: result
          };
        } catch (error) {
          logger.logToolError(name, timing.requestId, timing.startTime, error);
          return createErrorResponse(
            `Error searching ABAP Feature Matrix: ${error}`,
            timing.requestId
          );
        }
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  /**
   * Setup prompt handlers (variant-aware prompt catalog with backward-compatible aliases)
   */
  private static setupPromptHandlers(srv: Server): void {
    const isAbapVariant = getVariantName() === "abap";

    // List available prompts
    srv.setRequestHandler(ListPromptsRequestSchema, async () => {
      if (isAbapVariant) {
        return {
          prompts: [
            {
              name: "abap_search_help",
              title: "ABAP/RAP Documentation Search Helper",
              description: "Helps users construct effective search queries for ABAP and RAP documentation",
              arguments: [
                {
                  name: "topic",
                  description: "ABAP topic (RAP, CDS, BOPF, etc.)",
                  required: false
                },
                {
                  name: "flavor",
                  description: "ABAP flavor: standard (on-premise) or cloud (BTP)",
                  required: false
                }
              ]
            },
            {
              name: "abap_troubleshoot",
              title: "ABAP Issue Troubleshooting Guide",
              description: "Guides users through troubleshooting common ABAP development issues",
              arguments: [
                {
                  name: "error_message",
                  description: "Error message or symptom description",
                  required: false
                },
                {
                  name: "context",
                  description: "Development context (RAP, CDS, classic ABAP, etc.)",
                  required: false
                }
              ]
            }
          ]
        };
      }

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
- Standard ABAP (on-premise, full syntax) is the default
- Add "cloud" or "btp" to search ABAP Cloud (restricted syntax)
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

        case "abap_search_help":
          const topic = args?.topic || "ABAP";
          const flavor = args?.flavor || "standard";
          
          return {
            description: `Search helper for ${topic} documentation (${flavor})`,
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `I need help searching ${topic} documentation for ${flavor} ABAP. What search terms should I use to find the most relevant results?

Here are some tips for effective ABAP documentation searches:

**For Standard ABAP (on-premise):**
- Use specific ABAP statements: "SELECT", "LOOP", "MODIFY", "READ TABLE"
- Include object types: "class", "method", "interface", "function module"
- Mention specific features: "internal tables", "field symbols", "data references"

**For ABAP Cloud (BTP):**
- Add "cloud" or "btp" to your query to filter for cloud-compatible syntax
- Focus on released APIs and objects
- Use RAP-related terms: "behavior definition", "projection", "unmanaged"

**For RAP (RESTful Application Programming):**
- Use specific RAP terms: "behavior definition", "behavior implementation"
- Include entity types: "root entity", "child entity", "composition"
- Mention actions and determinations: "action", "determination", "validation"

**For CDS (Core Data Services):**
- Use CDS keywords: "define view", "association", "composition"
- Include annotation types: "@UI", "@ObjectModel", "@Consumption"
- Mention specific features: "virtual elements", "calculated fields"

**General Tips:**
- Be specific rather than broad
- Include error codes if troubleshooting
- Use technical ABAP terms
- Combine multiple related terms

What specific ABAP topic are you looking for help with?`
                }
              }
            ]
          };

        case "sap_troubleshoot":
          const sapErrorMessage = args?.error_message || "an issue";
          const technology = args?.technology || "SAP";
          
          return {
            description: "Troubleshooting guide for SAP",
            messages: [
              {
                role: "user", 
                content: {
                  type: "text",
                  text: `I'm experiencing ${sapErrorMessage} with ${technology}. Let me help you troubleshoot this systematically.

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
- Standard ABAP is default; add "cloud" or "btp" for ABAP Cloud
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

        case "abap_troubleshoot":
          const errorMessage = args?.error_message || "an issue";
          const abapContext = args?.context || "ABAP";
          
          return {
            description: `Troubleshooting guide for ${abapContext}`,
            messages: [
              {
                role: "user", 
                content: {
                  type: "text",
                  text: `I'm experiencing ${errorMessage} with ${abapContext}. Let me help you troubleshoot this systematically.

**Step 1: Information Gathering**
- What is the exact error message or symptom?
- When does this occur (during development, activation, runtime)?
- Are you using Standard ABAP or ABAP Cloud?
- Is this related to RAP, CDS, or classic ABAP?

**Step 2: Initial Search Strategy**
Let me search the ABAP documentation for similar issues:

**For Syntax Errors:**
- Search for the exact ABAP statement causing issues
- Check if the syntax is cloud-compatible (add "cloud" to query)
- Look for deprecated or changed syntax

**For RAP Issues:**
- Check behavior definition and implementation
- Verify entity relationships and compositions
- Look for action/determination/validation patterns

**For CDS Issues:**
- Verify view definitions and associations
- Check annotation syntax and targets
- Look for authorization and access control issues

**For Runtime Errors:**
- Search for the exact runtime error (e.g., "CX_SY_ZERODIVIDE")
- Check object dependencies
- Verify data types and conversions

**Step 3: Common Solutions**
Based on the issue type, I'll search for:
- Official ABAP keyword documentation
- ABAP Cheat Sheets with examples
- Clean ABAP style guide recommendations
- RAP sample implementations

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
   * Setup resource handlers (templates + read)
   */
  private static setupResourceHandlers(srv: Server): void {
    // Keep list lightweight; rely on templates for scale
    srv.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "abap-docs:///community",
            name: "SAP Community Posts",
            title: "SAP Community Posts",
            description: "Real-time access to SAP Community posts and solutions.",
            mimeType: "text/markdown"
          }
        ]
      };
    });

    srv.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      return {
        resourceTemplates: [
          {
            uriTemplate: "abap-docs://doc/{docId}",
            name: "ABAP Doc by ID",
            title: "ABAP Document by ID",
            description: "Read a document by search result id. URL-encode the id (e.g., /abap-docs-standard/abapselect).",
            mimeType: "text/markdown"
          },
          {
            uriTemplate: "abap-docs://library/{libraryId}",
            name: "ABAP Library Overview",
            title: "ABAP Library Overview",
            description: "Read a library overview (libraryId without leading slash, e.g., abap-docs-standard).",
            mimeType: "text/markdown"
          },
          {
            uriTemplate: "abap-docs://library/{libraryId}/{topic}",
            name: "ABAP Library Topic",
            title: "ABAP Library Topic",
            description: "Read a topic within a library (topic may be URL-encoded).",
            mimeType: "text/markdown"
          }
        ]
      };
    });

    srv.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      const docPrefix = "abap-docs://doc/";
      const libraryPrefix = "abap-docs://library/";

      try {
        if (uri.startsWith(docPrefix)) {
          const encodedId = uri.slice(docPrefix.length);
          if (!encodedId) {
            throw new Error("Missing docId in resource URI.");
          }
          const docId = decodeURIComponent(encodedId);
          const text = await fetchLibraryDocumentation(docId);
          if (!text) {
            throw new Error(`Document not found: ${docId}`);
          }
          return {
            contents: [
              {
                uri,
                mimeType: "text/markdown",
                text
              }
            ]
          };
        }

        if (uri.startsWith(libraryPrefix)) {
          const rest = uri.slice(libraryPrefix.length);
          const [libraryIdRaw, ...topicParts] = rest.split("/");
          if (!libraryIdRaw) {
            throw new Error("Missing libraryId in resource URI.");
          }
          const libraryId = libraryIdRaw.startsWith("/") ? libraryIdRaw : `/${libraryIdRaw}`;
          const topic = topicParts.length ? decodeURIComponent(topicParts.join("/")) : "";
          const text = await fetchLibraryDocumentation(libraryId, topic);
          if (!text) {
            throw new Error(`Library not found: ${libraryId}`);
          }
          return {
            contents: [
              {
                uri,
                mimeType: "text/markdown",
                text
              }
            ]
          };
        }

        // Fallback to legacy resource URIs (abap-docs:///library/relFile, community, etc.)
        return await readDocumentationResource(uri);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("Resource read failed", { uri, error: message });
        throw new Error(message);
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
