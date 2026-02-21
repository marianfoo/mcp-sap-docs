// Software Heroes Content Search
// Search articles, pages, code, and feed from software-heroes.com using START_SEARCH_JSON API
// Uses structured JSON response to avoid HTML parsing entirely.

import {
  callSoftwareHeroesApi,
  SoftwareHeroesApiOptions,
  SoftwareHeroesSearchJsonItem,
  decodeEntities,
  stripTags,
} from "./core.js";
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

/** Normalised search hit used internally and in tests */
export interface ParsedSearchHit {
  title: string;
  snippet: string;
  url: string;
  /** Content type indicator (e.g., "article", "page") */
  kind?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = "https://software-heroes.com";

// ---------------------------------------------------------------------------
// Shared URL helper
// ---------------------------------------------------------------------------

/** Make a relative path or numeric page ID into an absolute URL */
const absolutizeUrl = (link: string): string => {
  if (!link) return "";
  // Already absolute
  if (link.startsWith("http://") || link.startsWith("https://")) return link;
  // Numeric page ID → e.g. "1768" → "https://software-heroes.com/1768"
  if (/^\d+$/.test(link)) return `${BASE_URL}/${link}`;
  // Relative path → ensure single leading slash
  const cleanPath = link.startsWith("/") ? link : "/" + link;
  return BASE_URL + cleanPath;
};

// ---------------------------------------------------------------------------
// JSON Parser (START_SEARCH_JSON) — primary path, no HTML parsing required
// ---------------------------------------------------------------------------

/** Map TYPE field returned by START_SEARCH_JSON to a human-readable kind string */
const typeToKind = (type: string): string => {
  switch (type) {
    case "B": return "article"; // Blog post
    case "P": return "page";
    default:  return "article";
  }
};

/**
 * Parse the structured JSON array returned by START_SEARCH_JSON into
 * the shared ParsedSearchHit format.
 *
 * TEXT fields may contain HTML entities (e.g. &amp;, &#39;) but no HTML tags,
 * so only decodeEntities is needed — no tag stripping required.
 */
export function parseSoftwareHeroesSearchJson(
  items: SoftwareHeroesSearchJsonItem[]
): ParsedSearchHit[] {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item.HEAD)
    .map((item) => ({
      title: decodeEntities(item.HEAD),
      snippet: decodeEntities(item.TEXT ?? ""),
      url: absolutizeUrl(item.LINK),
      kind: typeToKind(item.TYPE),
    }));
}

// ---------------------------------------------------------------------------
// Legacy HTML Parser (START_SEARCH)
// ---------------------------------------------------------------------------

/**
 * Parse search result HTML from the legacy Software Heroes START_SEARCH response.
 * Best-effort regex-based parsing (no external HTML parser dependency).
 *
 * @param html - HTML content from screen[].content where id="id_search_out"
 * @returns Array of parsed search hits
 * @deprecated Prefer START_SEARCH_JSON + parseSoftwareHeroesSearchJson — no HTML parsing required.
 */
export function parseSoftwareHeroesSearchHtml(html: string): ParsedSearchHit[] {
  const results: ParsedSearchHit[] = [];

  if (!html) return results;

  // Split on card boundaries — each result lives in a cls_app_card div
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

    // Extract URL from <a href="..."> inside cls_app_buttons, with fallback to any href
    const buttonsMatch = cardHtml.match(/<div[^>]*class="[^"]*cls_app_buttons[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    let url = "";
    if (buttonsMatch) {
      const hrefMatch = buttonsMatch[1].match(/href="([^"]+)"/i);
      if (hrefMatch) url = absolutizeUrl(decodeEntities(hrefMatch[1]));
    }
    if (!url) {
      const anyHrefMatch = cardHtml.match(/href="([^"]+)"/i);
      if (anyHrefMatch) url = absolutizeUrl(decodeEntities(anyHrefMatch[1]));
    }

    // Derive kind from icon class text, fall back to URL path analysis
    const iconMatch = cardHtml.match(/<div[^>]*class="[^"]*cls_icon[^"]*cls_app_icon[^"]*"[^>]*>([^<]*)</i);
    const iconText = (iconMatch ? iconMatch[1] : "").toLowerCase();
    let kind: string;
    if (iconText.includes("rss_feed"))              kind = "feed";
    else if (iconText.includes("school"))           kind = "article";
    else if (iconText.includes("insert_drive_file")) kind = "page";
    else if (iconText.includes("code"))             kind = "code";
    else if (url.includes("/blog/"))                kind = "article";
    else if (url.includes("/feed"))                 kind = "feed";
    else                                            kind = "article";

    results.push({ title, snippet, url, kind });
  }

  return results;
}

// ---------------------------------------------------------------------------
// API Search Function
// ---------------------------------------------------------------------------

/**
 * Search Software Heroes content using the START_SEARCH_JSON API method.
 * Returns structured JSON directly — no HTML parsing required.
 *
 * @param query - Search query string
 * @param options - Search options (language, filters, sort)
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

    // START_SEARCH_JSON returns structured data[] instead of HTML in screen[]
    const response = await callSoftwareHeroesApi("START_SEARCH_JSON", dataParams, {
      client,
      timeoutMs,
    });

    if (!response.status) {
      return {
        results: [],
        error: `Software Heroes search error: ${response.msg}`,
      };
    }

    // data is a SoftwareHeroesSearchJsonItem[] for START_SEARCH_JSON
    const jsonItems = response.data as SoftwareHeroesSearchJsonItem[] | undefined;

    if (!Array.isArray(jsonItems) || jsonItems.length === 0) {
      return {
        results: [],
        error: `No results found on Software Heroes for "${sanitizedQuery}"`,
      };
    }

    const hits = parseSoftwareHeroesSearchJson(jsonItems);

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

    return { results };
  } catch (error: any) {
    console.warn(`❌ [SoftwareHeroes] Content search error: ${error.message}`);
    return {
      results: [],
      error: `Software Heroes search failed: ${error.message}`,
    };
  }
}
