// Software Heroes Content Search
// Search articles, pages, code, and feed from software-heroes.com using START_SEARCH API

import { callSoftwareHeroesApi, SoftwareHeroesApiOptions, decodeEntities, stripTags } from "./core.js";
import { SearchResponse, SearchResult } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SoftwareHeroesSearchOptions extends SoftwareHeroesApiOptions {
  /** Language code (default: "en") */
  language?: string;
  /** Search in code snippets (default: true) */
  searchCode?: boolean;
  /** Search in articles (default: true) */
  searchArticles?: boolean;
  /** Search in pages (default: true) */
  searchPages?: boolean;
  /** Search in feed (default: false) */
  searchFeed?: boolean;
  /** Sort order (default: "DATE_DESC") */
  sortOrder?: "DATE_DESC" | "DATE_ASC" | "RELEVANCE";
}

/** Parsed search result from HTML */
export interface ParsedSearchHit {
  title: string;
  snippet: string;
  url: string;
  /** Content type indicator (e.g., "article", "feed", "page") */
  kind?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = "https://software-heroes.com";

// ---------------------------------------------------------------------------
// HTML Parsing Utilities (decodeEntities & stripTags imported from core.ts)
// ---------------------------------------------------------------------------

/** Make a relative URL absolute */
const absolutizeUrl = (href: string): string => {
  if (!href) return "";
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }
  // Ensure leading slash for relative URLs
  const cleanHref = href.startsWith("/") ? href : "/" + href;
  return BASE_URL + cleanHref;
};

/** Derive content kind from icon class or URL path */
const deriveKind = (iconText: string, url: string): string => {
  // Check icon type first
  const iconLower = iconText.toLowerCase();
  if (iconLower.includes("rss_feed")) return "feed";
  if (iconLower.includes("school")) return "article";
  if (iconLower.includes("insert_drive_file")) return "page";
  if (iconLower.includes("code")) return "code";
  
  // Fall back to URL path analysis
  if (url.includes("/blog/")) return "article";
  if (url.includes("/feed")) return "feed";
  
  return "article"; // default
};

// ---------------------------------------------------------------------------
// HTML Parser
// ---------------------------------------------------------------------------

/**
 * Parse search result HTML from Software Heroes START_SEARCH response
 * Best-effort regex-based parsing (no external HTML parser dependency)
 * 
 * @param html - HTML content from screen[].content where id="id_search_out"
 * @returns Array of parsed search hits
 */
export function parseSoftwareHeroesSearchHtml(html: string): ParsedSearchHit[] {
  const results: ParsedSearchHit[] = [];
  
  if (!html) return results;

  // Split on card boundaries - each result is in a cls_app_card div
  // Use a regex to find each card block
  const cardRegex = /<div\s+class="cls_app_card">([\s\S]*?)(?=<div\s+class="cls_app_card">|$)/gi;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const cardHtml = match[1];
    if (!cardHtml) continue;

    // Extract title from <h4>...</h4>
    const titleMatch = cardHtml.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    const title = titleMatch ? stripTags(titleMatch[1]) : "";
    
    if (!title) continue; // Skip cards without titles

    // Extract snippet from <p>...</p>
    const snippetMatch = cardHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : "";

    // Extract URL from <a href="..."> inside cls_app_buttons
    // Look for the href in the buttons section
    const buttonsMatch = cardHtml.match(/<div[^>]*class="[^"]*cls_app_buttons[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    let url = "";
    if (buttonsMatch) {
      const hrefMatch = buttonsMatch[1].match(/href="([^"]+)"/i);
      if (hrefMatch) {
        url = absolutizeUrl(decodeEntities(hrefMatch[1]));
      }
    }
    
    // Fallback: look for any href in the card if buttons section didn't have one
    if (!url) {
      const anyHrefMatch = cardHtml.match(/href="([^"]+)"/i);
      if (anyHrefMatch) {
        url = absolutizeUrl(decodeEntities(anyHrefMatch[1]));
      }
    }

    // Extract icon type for kind derivation
    const iconMatch = cardHtml.match(/<div[^>]*class="[^"]*cls_icon[^"]*cls_app_icon[^"]*"[^>]*>([^<]*)</i);
    const iconText = iconMatch ? iconMatch[1] : "";
    
    const kind = deriveKind(iconText, url);

    results.push({
      title,
      snippet,
      url,
      kind,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// API Search Function
// ---------------------------------------------------------------------------

/**
 * Search Software Heroes content using the START_SEARCH API method
 * 
 * @param query - Search query string
 * @param options - Search options (language, filters, etc.)
 * @returns SearchResponse compatible with the unified search pipeline
 */
export async function searchSoftwareHeroesContent(
  query: string,
  options: SoftwareHeroesSearchOptions = {}
): Promise<SearchResponse> {
  const {
    language = "en",
    searchCode = true,
    searchArticles = true,
    searchPages = true,
    searchFeed = false,
    sortOrder = "DATE_DESC",
    client,
    timeoutMs,
  } = options;

  try {
    // Sanitize query: trim whitespace and newlines which break the API
    const sanitizedQuery = query.trim();
    
    // Build request data parameters matching the API format
    const dataParams: Record<string, string> = {
      id_user: "",
      id_pass: "",
      id_stay: "X",
      id_search_pattern: sanitizedQuery,
      id_search_code: searchCode ? "X" : "",
      id_search_articles: searchArticles ? "X" : "",
      id_search_pages: searchPages ? "X" : "",
      id_search_feed: searchFeed ? "X" : "",
      id_langu: language,
      id_page: "search",
      id_error: "",
      id_hfld_evt: "",
      id_hfld_obj: "",
      id_search_sort: sortOrder,
    };

    // Call the API
    const response = await callSoftwareHeroesApi("START_SEARCH", dataParams, {
      client,
      timeoutMs,
    });

    if (!response.status) {
      return {
        results: [],
        error: `Software Heroes search error: ${response.msg}`,
      };
    }

    // Find the search output screen item
    const searchOutput = response.screen?.find(
      (item) => item.id === "id_search_out"
    );

    if (!searchOutput?.content) {
      return {
        results: [],
        error: "No search results returned from Software Heroes",
      };
    }

    // Parse the HTML content
    const hits = parseSoftwareHeroesSearchHtml(searchOutput.content);

    if (hits.length === 0) {
      return {
        results: [],
        error: `No results found on Software Heroes for "${sanitizedQuery}"`,
      };
    }

    // Convert to SearchResult format
    const results: SearchResult[] = hits.map((hit, index) => ({
      library_id: `software-heroes-${index}`,
      topic: "",
      id: `software-heroes-${index}`,
      title: hit.title,
      url: hit.url,
      snippet: hit.snippet,
      score: 0, // Score will be assigned by RRF in search.ts
      metadata: {
        source: "software-heroes",
        kind: hit.kind,
        rank: index + 1,
      },
      // Legacy fields for backward compatibility
      description: hit.snippet,
      totalSnippets: 1,
      source: "software-heroes",
    }));

    console.log(
      `✅ [SoftwareHeroes] Found ${results.length} content results for "${query}"`
    );

    return {
      results,
    };
  } catch (error: any) {
    console.warn(`❌ [SoftwareHeroes] Content search error: ${error.message}`);
    return {
      results: [],
      error: `Software Heroes search failed: ${error.message}`,
    };
  }
}
