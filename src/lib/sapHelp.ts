import { 
  SearchResponse, 
  SearchResult, 
  SapHelpSearchResponse, 
  SapHelpMetadataResponse, 
  SapHelpPageContentResponse 
} from "./types.js";
import { truncateContent } from "./truncate.js";

const BASE = "https://help.sap.com";

// ---------- Utils ----------
function toQuery(params: Record<string, any>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

function ensureAbsoluteUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Ensure leading slash for relative URLs
  const cleanUrl = url.startsWith('/') ? url : '/' + url;
  return BASE + cleanUrl;
}

function parseDocsPathParts(urlOrPath: string): { productUrlSeg: string; deliverableLoio: string } {
  // Accept relative path like /docs/PROD/DELIVERABLE/FILE.html?... or full URL
  const u = new URL(urlOrPath, BASE);
  const parts = u.pathname.split("/").filter(Boolean); // ["docs", "{product}", "{deliverable}", "{file}.html"]
  if (parts[0] !== "docs" || parts.length < 4) {
    throw new Error("Unexpected docs URL: " + u.href);
  }
  const productUrlSeg = parts[1];
  const deliverableLoio = parts[2]; // e.g., 007d655fd353410e9bbba4147f56c2f0
  return { productUrlSeg, deliverableLoio };
}

/**
 * Search SAP Help using the private elasticsearch endpoint
 */
export async function searchSapHelp(query: string): Promise<SearchResponse> {
  try {
    const searchParams = {
      transtype: "standard,html,pdf,others",
      state: "PRODUCTION,TEST,DRAFT",
      product: "",
      version: "",
      q: query,
      to: "19", // Limit to 20 results (0-19)
      area: "content",
      advancedSearch: "0",
      excludeNotSearchable: "1",
      language: "en-US",
    };

    const searchUrl = `${BASE}/http.svc/elasticsearch?${toQuery(searchParams)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "mcp-sap-docs/help-search",
        Referer: BASE,
      },
    });

    if (!response.ok) {
      throw new Error(`SAP Help search failed: ${response.status} ${response.statusText}`);
    }

    const data: SapHelpSearchResponse = await response.json();
    const results = data?.data?.results || [];

    if (!results.length) {
      return {
        results: [],
        error: `No SAP Help results found for "${query}"`
      };
    }

    // Store the search results for later retrieval
    const searchResults: SearchResult[] = results.map((hit, index) => ({
      library_id: `sap-help-${hit.loio}`,
      topic: '',
      id: `sap-help-${hit.loio}`,
      title: hit.title,
      url: ensureAbsoluteUrl(hit.url),
      snippet: `${hit.snippet || hit.title} — Product: ${hit.product || hit.productId || "Unknown"} (${hit.version || hit.versionId || "Latest"})`,
      score: 0,
      metadata: {
        source: "help",
        loio: hit.loio,
        product: hit.product || hit.productId,
        version: hit.version || hit.versionId,
        rank: index + 1
      },
      // Legacy fields for backward compatibility
      description: `${hit.snippet || hit.title} — Product: ${hit.product || hit.productId || "Unknown"} (${hit.version || hit.versionId || "Latest"})`,
      totalSnippets: 1,
      source: "help"
    }));

    // Store the full search results in a simple cache for retrieval
    // In a real implementation, you might want a more sophisticated cache
    if (!global.sapHelpSearchCache) {
      global.sapHelpSearchCache = new Map();
    }
    results.forEach(hit => {
      global.sapHelpSearchCache!.set(hit.loio, hit);
    });

    // Format response similar to other search functions
    const formattedResults = searchResults.slice(0, 20).map((result, i) => 
      `[${i}] **${result.title}**\n   ID: \`${result.id}\`\n   URL: ${result.url}\n   ${result.description}\n`
    ).join('\n');

    return {
      results: searchResults.length > 0 ? searchResults : [{
        library_id: "sap-help",
        topic: '',
        id: "search-results",
        title: `SAP Help Search Results for "${query}"`,
        url: '',
        snippet: `Found ${searchResults.length} results from SAP Help:\n\n${formattedResults}\n\nUse sap_help_get with the ID of any result to retrieve the full content.`,
        score: 0,
        metadata: {
          source: "help",
          totalSnippets: searchResults.length
        },
        // Legacy fields for backward compatibility
        description: `Found ${searchResults.length} results from SAP Help:\n\n${formattedResults}\n\nUse sap_help_get with the ID of any result to retrieve the full content.`,
        totalSnippets: searchResults.length,
        source: "help"
      }]
    };

  } catch (error: any) {
    return {
      results: [],
      error: `SAP Help search error: ${error.message}`
    };
  }
}

/**
 * Get full content of a SAP Help page using the private APIs
 * First gets metadata, then page content
 */
export async function getSapHelpContent(resultId: string): Promise<string> {
  try {
    // Extract loio from the result ID
    const loio = resultId.replace('sap-help-', '');
    if (!loio || loio === resultId) {
      throw new Error("Invalid SAP Help result ID. Use an ID from sap_help_search results.");
    }

    // First try to get from cache
    const cache = global.sapHelpSearchCache || new Map();
    let hit = cache.get(loio);

    if (!hit) {
      // If not in cache, search again to get the full hit data
      const searchParams = {
        transtype: "standard,html,pdf,others", 
        state: "PRODUCTION,TEST,DRAFT",
        product: "",
        version: "",
        q: loio, // Search by loio to find the specific document
        to: "19",
        area: "content",
        advancedSearch: "0",
        excludeNotSearchable: "1",
        language: "en-US",
      };

      const searchUrl = `${BASE}/http.svc/elasticsearch?${toQuery(searchParams)}`;
      const searchResponse = await fetch(searchUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "mcp-sap-docs/help-get",
          Referer: BASE,
        },
      });

      if (!searchResponse.ok) {
        throw new Error(`Failed to find document: ${searchResponse.status} ${searchResponse.statusText}`);
      }

      const searchData: SapHelpSearchResponse = await searchResponse.json();
      const results = searchData?.data?.results || [];
      hit = results.find(r => r.loio === loio);

      if (!hit) {
        throw new Error(`Document with loio ${loio} not found`);
      }
    }

    // Prepare metadata request parameters
    const topic_url = `${hit.loio}.html`;
    let product_url = hit.productId;
    let deliverable_url;

    try {
      const { productUrlSeg, deliverableLoio } = parseDocsPathParts(hit.url);
      deliverable_url = deliverableLoio;
      if (!product_url) product_url = productUrlSeg;
    } catch (e) {
      if (!product_url) {
        throw new Error("Could not determine product_url from hit; missing productId and unparsable url");
      }
    }

    const language = hit.language || "en-US";

    // Get deliverable metadata
    const metadataParams = {
      product_url,
      topic_url,
      version: "LATEST",
      loadlandingpageontopicnotfound: "true",
      deliverable_url,
      language,
      deliverableInfo: "1",
      toc: "1",
    };

    const metadataUrl = `${BASE}/http.svc/deliverableMetadata?${toQuery(metadataParams)}`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "mcp-sap-docs/help-metadata",
        Referer: BASE,
      },
    });

    if (!metadataResponse.ok) {
      throw new Error(`Metadata request failed: ${metadataResponse.status} ${metadataResponse.statusText}`);
    }

    const metadataData: SapHelpMetadataResponse = await metadataResponse.json();
    const deliverable_id = metadataData?.data?.deliverable?.id;
    const buildNo = metadataData?.data?.deliverable?.buildNo;
    const file_path = metadataData?.data?.filePath || topic_url;

    if (!deliverable_id || !buildNo || !file_path) {
      throw new Error("Missing required metadata: deliverable_id, buildNo, or file_path");
    }

    // Get page content
    const pageParams = {
      deliverableInfo: "1",
      deliverable_id,
      buildNo,
      file_path,
    };

    const pageUrl = `${BASE}/http.svc/pagecontent?${toQuery(pageParams)}`;
    const pageResponse = await fetch(pageUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "mcp-sap-docs/help-content",
        Referer: BASE,
      },
    });

    if (!pageResponse.ok) {
      throw new Error(`Page content request failed: ${pageResponse.status} ${pageResponse.statusText}`);
    }

    const pageData: SapHelpPageContentResponse = await pageResponse.json();
    const title = pageData?.data?.currentPage?.t || pageData?.data?.deliverable?.title || hit.title;
    const bodyHtml = pageData?.data?.body || "";

    if (!bodyHtml) {
      return `# ${title}\n\nNo content available for this page.`;
    }

    // Convert HTML to readable text while preserving structure
    const cleanText = bodyHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
      .replace(/<h([1-6])[^>]*>/gi, (_, level) => '\n' + '#'.repeat(parseInt(level)) + ' ') // Convert headings
      .replace(/<\/h[1-6]>/gi, '\n') // Close headings
      .replace(/<p[^>]*>/gi, '\n') // Paragraphs
      .replace(/<\/p>/gi, '\n')
      .replace(/<br[^>]*>/gi, '\n') // Line breaks
      .replace(/<li[^>]*>/gi, '• ') // List items
      .replace(/<\/li>/gi, '\n')
      .replace(/<code[^>]*>/gi, '`') // Inline code
      .replace(/<\/code>/gi, '`')
      .replace(/<pre[^>]*>/gi, '\n```\n') // Code blocks
      .replace(/<\/pre>/gi, '\n```\n')
      .replace(/<[^>]+>/g, '') // Remove remaining HTML tags
      .replace(/\s*\n\s*\n\s*/g, '\n\n') // Clean up multiple newlines
      .replace(/^\s+|\s+$/g, '') // Trim
      .trim();

    // Build the full content with metadata
    const fullContent = `# ${title}

**Source:** SAP Help Portal
**URL:** ${ensureAbsoluteUrl(hit.url)}
**Product:** ${hit.product || hit.productId || "Unknown"}
**Version:** ${hit.version || hit.versionId || "Latest"}
**Language:** ${hit.language || "en-US"}
${hit.snippet ? `**Summary:** ${hit.snippet}` : ''}

---

${cleanText}

---

*This content is from the SAP Help Portal and represents official SAP documentation.*`;

    // Apply intelligent truncation if content is too large
    const truncationResult = truncateContent(fullContent);
    
    return truncationResult.content;

  } catch (error: any) {
    throw new Error(`Failed to get SAP Help content: ${error.message}`);
  }
}