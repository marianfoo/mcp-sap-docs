// src/lib/communityBestMatch.ts
// Search SAP Community via the Khoros LiQL API (JSON).
// The previous HTML-scraping approach was blocked by AWS WAF bot detection.

import { CONFIG } from "./config.js";
import { truncateContent } from "./truncate.js";

export interface BestMatchHit {
  title: string;
  url: string;
  author?: string;
  published?: string; // e.g., "2024 Dec 11 4:31 PM"
  likes?: number;
  snippet?: string;
  tags?: string[];
  postId?: string; // extracted from URL for retrieval
}

type Options = {
  includeBlogs?: boolean; // default true
  limit?: number;         // default 20
  minKudos?: number;      // default 1; set 0 for broad search, higher for quality filter (max ~10)
  userAgent?: string;     // optional UA override
};

const LIQL_BASE = "https://community.sap.com/api/2.0/search";

const stripTags = (html = "") =>
  html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Extract post ID from view_href URL
const extractPostId = (url: string): string | undefined => {
  const urlMatch = url.match(/\/(?:ba-p|td-p|qaq-p|qaa-p|m-p)\/(\d+)/);
  if (urlMatch) return urlMatch[1];
  const endMatch = url.match(/\/(\d+)(?:[#?]|$)/);
  return endMatch ? endMatch[1] : undefined;
};

/**
 * Build a LiQL URL for full-text search on SAP Community.
 * Uses MATCHES on subject and/or body (combined with OR per Khoros docs).
 * Returns topic-level messages only (depth=0) to avoid reply noise.
 */
export function buildLiqlSearchUrl(query: string, limit = 20, subjectOnly = false, minKudos = 0): string {
  const escaped = query.replace(/'/g, "\\'");
  const matchClause = subjectOnly
    ? `subject MATCHES '${escaped}'`
    : `(subject MATCHES '${escaped}' OR body MATCHES '${escaped}')`;
  const kudosClause = minKudos > 0 ? ` AND kudos.sum(weight) >= ${minKudos}` : "";
  const liql = [
    "SELECT id, subject, search_snippet, post_time, view_href, kudos.sum(weight)",
    "FROM messages",
    `WHERE ${matchClause} AND depth = 0${kudosClause}`,
    `LIMIT ${limit}`,
  ].join(" ");
  return `${LIQL_BASE}?q=${encodeURIComponent(liql)}`;
}

async function executeLiqlSearch(url: string, userAgent?: string): Promise<any[]> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent || "sap-docs-mcp/1.0 (LiQLSearch)",
    },
  });

  if (!response.ok) {
    console.warn(`[SAP Community] API returned ${response.status}: ${response.statusText}`);
    return [];
  }

  const data = (await response.json()) as any;
  if (data.status !== "success" || !data.data?.items) {
    console.warn("[SAP Community] API returned non-success or no items", data.status);
    return [];
  }

  return data.data.items;
}

function mapItemsToHits(items: any[]): BestMatchHit[] {
  return items.map((item: any): BestMatchHit => {
    const viewHref = item.view_href || "";
    const postId = String(item.id || "") || extractPostId(viewHref);
    const snippet = item.search_snippet ? stripTags(item.search_snippet).slice(0, CONFIG.EXCERPT_LENGTH_COMMUNITY) : undefined;
    const published = item.post_time
      ? new Date(item.post_time).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
      : undefined;

    return {
      title: item.subject || "",
      url: viewHref,
      published,
      likes: item.kudos?.sum?.weight ?? undefined,
      snippet,
      postId,
    };
  });
}

/**
 * Multi-pass search strategy to handle MATCHES OR-semantics:
 *
 * LiQL MATCHES 'RAP Augmentation' returns any post containing "RAP" OR
 * "Augmentation", so common words like "RAP" drown out specific terms.
 * To surface relevant posts we:
 *   1. Search each individual query term separately via subject MATCHES
 *   2. Search the full phrase via subject+body MATCHES
 *   3. Merge all results, score by how many query terms appear in the subject
 *   4. Sort by term-hit count > kudos > recency
 */
export async function searchCommunityBestMatch(
  query: string,
  opts: Options = {}
): Promise<BestMatchHit[]> {
  const { limit = 20, minKudos = 1, userAgent } = opts;
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  const perTermLimit = Math.max(limit, 20);

  const allItems: any[] = [];

  // Per-term subject searches (parallel) -- ensures rare terms surface
  const termSearches = queryTerms.map(term => {
    const url = buildLiqlSearchUrl(term, perTermLimit, true, minKudos);
    console.log(`[SAP Community] LiQL per-term (subject): term="${term}" minKudos=${minKudos}`);
    return executeLiqlSearch(url, userAgent);
  });

  // Full-phrase broad search (subject+body)
  const broadUrl = buildLiqlSearchUrl(query, perTermLimit, false, minKudos);
  console.log(`[SAP Community] LiQL broad (subject+body): query="${query}" minKudos=${minKudos}`);
  const broadSearch = executeLiqlSearch(broadUrl, userAgent);

  const termResults = await Promise.all(termSearches);
  const broadItems = await broadSearch;

  for (const items of termResults) allItems.push(...items);
  allItems.push(...broadItems);

  // Dedupe
  const byId = new Map<string, any>();
  for (const item of allItems) {
    const id = String(item.id);
    if (!byId.has(id)) byId.set(id, item);
  }

  // Score: posts whose subject contains MORE query terms rank higher
  const scored = Array.from(byId.values()).map(item => {
    const subjectLower = (item.subject || "").toLowerCase();
    let termHits = 0;
    for (const term of queryTerms) {
      if (subjectLower.includes(term)) termHits++;
    }
    const kudos = item.kudos?.sum?.weight ?? 0;
    const postTime = item.post_time ? new Date(item.post_time).getTime() : 0;
    return { item, termHits, kudos, postTime };
  });

  scored.sort((a, b) => {
    if (b.termHits !== a.termHits) return b.termHits - a.termHits;
    if (b.kudos !== a.kudos) return b.kudos - a.kudos;
    return b.postTime - a.postTime;
  });

  const totalFetched = termResults.reduce((s, r) => s + r.length, 0) + broadItems.length;
  console.log(`[SAP Community] Merged: ${totalFetched} fetched -> ${byId.size} unique, returning top ${limit}`);
  return mapItemsToHits(scored.slice(0, limit).map(s => s.item));
}

// Convenience function: Search and get full content of top N posts in one call
export async function searchAndGetTopPosts(
  query: string, 
  topN: number = 3,
  opts: Options = {}
): Promise<{ search: BestMatchHit[], posts: { [id: string]: string } }> {
  // First, search for posts
  const searchResults = await searchCommunityBestMatch(query, { ...opts, limit: Math.max(topN, opts.limit || 20) });
  
  // Extract post IDs from top N results
  const topResults = searchResults.slice(0, topN);
  const postIds = topResults
    .map(result => result.postId)
    .filter((id): id is string => id !== undefined);
  
  // Batch retrieve full content
  const posts = await getCommunityPostsByIds(postIds, opts.userAgent);
  
  return {
    search: topResults,
    posts
  };
}

// Batch retrieve multiple posts using LiQL API
export async function getCommunityPostsByIds(postIds: string[], userAgent?: string): Promise<{ [id: string]: string }> {
  const results: { [id: string]: string } = {};
  
  if (postIds.length === 0) {
    return results;
  }

  try {
    // Build LiQL query for batch retrieval
    const idList = postIds.map(id => `'${id}'`).join(', ');
    const liqlQuery = `
      select body, id, subject, search_snippet, post_time, view_href 
      from messages 
      where id in (${idList})
    `.replace(/\s+/g, ' ').trim();

    const url = `https://community.sap.com/api/2.0/search?q=${encodeURIComponent(liqlQuery)}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': userAgent || 'sap-docs-mcp/1.0 (BatchRetrieval)'
      }
    });

    if (!response.ok) {
      console.warn(`SAP Community API returned ${response.status}: ${response.statusText}`);
      return results;
    }

    const data = await response.json() as any;
    
    if (data.status !== 'success' || !data.data?.items) {
      return results;
    }

    // Process each post
    for (const post of data.data.items) {
      const postDate = post.post_time ? new Date(post.post_time).toLocaleDateString() : 'Unknown';
      const postUrl = post.view_href || `https://community.sap.com/t5/technology-blogs-by-sap/bg-p/t/${post.id}`;
      
      const fullContent = `# ${post.subject}

**Source**: SAP Community Blog Post  
**Published**: ${postDate}  
**URL**: ${postUrl}

---

${post.body || post.search_snippet}

---

*This content is from the SAP Community and represents community knowledge and experiences.*`;

      // Apply intelligent truncation if content is too large
      const truncationResult = truncateContent(fullContent);
      results[post.id] = truncationResult.content;
    }

    return results;
  } catch (error) {
    console.warn('Failed to batch retrieve community posts:', error);
    return results;
  }
}

// Single post retrieval using LiQL API
export async function getCommunityPostById(postId: string, userAgent?: string): Promise<string | null> {
  const results = await getCommunityPostsByIds([postId], userAgent);
  return results[postId] || null;
}

// Retrieve a community post by its URL, extracting the post ID and using the LiQL API
export async function getCommunityPostByUrl(postUrl: string, userAgent?: string): Promise<string | null> {
  const postId = extractPostId(postUrl);
  if (!postId) {
    console.warn(`[SAP Community] Could not extract post ID from URL: ${postUrl}`);
    return null;
  }
  return getCommunityPostById(postId, userAgent);
}