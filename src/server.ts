import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  searchLibraries,
  fetchLibraryDocumentation,
  listDocumentationResources,
  readDocumentationResource,
  searchCommunity
} from "./lib/localDocs.js";
import { SearchResponse } from "./lib/types.js";

function createServer() {
  const srv = new Server({
    name: "Local SAP Docs",
    description:
      "Offline SAPUI5 & CAP documentation server with SAP Community integration",
    version: "0.1.0"
  }, {
    capabilities: { 
      resources: {},  // Enable resources capability
      tools: {} 
    }
  });

  // ================================================================ RESOURCES
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

  // ================================================================ TOOLS
  // List available tools
  srv.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "sap_docs_search",
          description: "Search across SAP documentation and UI5 control APIs. Searches through SAPUI5 documentation, CAP documentation, and OpenUI5 control APIs. Use this to find specific controls (like Button, Table, Wizard), concepts (like annotations, routing, authentication), or any SAP development topic. Returns a ranked list of matching documentation and controls with their IDs for use in sap_docs_get.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "What to search for. Examples: 'button' (finds UI5 Button controls), 'wizard' (finds Wizard controls and docs), 'annotation' (finds annotation docs across CAP/UI5), 'routing', 'authentication', 'table', 'odata', 'fiori elements', 'cds', or any SAP development concept. Can be UI5 control names, technical concepts, or general topics."
              }
            },
            required: ["query"]
          }
        },
        {
          name: "sap_community_search",
          description: "Search the SAP Community for blog posts, discussions, and solutions related to SAPUI5 and CAP development. Returns real-time results from the SAP Community with links to the original content and IDs for retrieving full posts. This tool searches across high-quality community content (posts with kudos > 5) to find practical, real-world solutions and best practices from SAP developers.",
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
          description: "Retrieve specific SAP documentation, UI5 control API details, or SAP Community posts. Use the IDs returned from sap_docs_search or sap_community_search to get full content. Works with library IDs, document IDs, and community post IDs (e.g., 'community-12345').",
          inputSchema: {
            type: "object",
            properties: {
              library_id: {
                type: "string",
                description: "Library or document ID from sap_docs_search results. Can be a library ID like '/sapui5', '/cap', '/openui5-api' for general docs, or a specific document ID like '/openui5-api/sap/m/Button' for detailed control API documentation. For community posts, use IDs like 'community-12345' from sap_community_search results."
              },
              topic: {
                type: "string",
                description: "Optional topic filter to narrow down results within a library. Examples: 'properties', 'events', 'methods', 'aggregations', 'routing', 'authentication', 'annotations'. Most useful with library IDs rather than specific document IDs."
              }
            },
            required: ["library_id"]
          }
        }
      ]
    };
  });

  // Handle tool execution
  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "sap_docs_search") {
      const { query } = args as { query: string };
      const res: SearchResponse = await searchLibraries(query);
      
      if (!res.results.length) {
        return {
          content: [
            {
              type: "text",
              text: res.error || `No results found for "${query}". Try searching for UI5 controls like 'button', 'table', 'wizard', or concepts like 'routing', 'annotation', 'authentication'.`
            }
          ]
        };
      }
      
      // Use the new formatted response from the improved search
      return {
        content: [
          {
            type: "text",
            text: res.results[0].description
          }
        ]
      };
    }

    if (name === "sap_community_search") {
      const { query } = args as { query: string };
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

    throw new Error(`Unknown tool: ${name}`);
  });

  return srv;
}

async function main() {
  const srv = createServer();
  await srv.connect(new StdioServerTransport());
  console.error("📚 MCP server ready (stdio) with Resources and Tools support.");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
}); 