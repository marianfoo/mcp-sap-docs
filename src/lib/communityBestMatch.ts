// src/lib/communityBestMatch.ts
// Scrape SAP Community search "Best Match" results directly from the HTML page.
// No external dependencies; best-effort selectors based on current Khoros layout.

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
  limit?: number;         // default 10
  userAgent?: string;     // optional UA override
};

const BASE = "https://community.sap.com";

const buildSearchUrl = (q: string, includeBlogs = true) => {
  const params = new URLSearchParams({
    collapse_discussion: "true",
    q,
  });
  if (includeBlogs) {
    params.set("filter", "includeBlogs");
    params.set("include_blogs", "true");
  }
  // "tab/message" view surfaces posts sorted by Best Match by default
  return `${BASE}/t5/forums/searchpage/tab/message?${params.toString()}`;
};

const decodeEntities = (s = "") =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const stripTags = (html = "") =>
  decodeEntities(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

const absolutize = (href: string) =>
  href?.startsWith("http") ? href : new URL(href, BASE).href;

// Extract post ID from URL for later retrieval
const extractPostId = (url: string): string | undefined => {
  // Extract from URL patterns like: /ba-p/13961398 or /td-p/13961398
  const urlMatch = url.match(/\/(?:ba-p|td-p)\/(\d+)/);
  if (urlMatch) {
    return urlMatch[1];
  }
  
  // Fallback: extract from end of URL
  const endMatch = url.match(/\/(\d+)(?:\?|$)/);
  return endMatch ? endMatch[1] : undefined;
};

async function fetchText(url: string, userAgent?: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent || "sap-docs-mcp/1.0 (BestMatchScraper)",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  return res.text();
}

function parseHitsFromHtml(html: string, limit = 10): BestMatchHit[] {
  const results: BestMatchHit[] = [];

  // Find all message wrapper divs with data-lia-message-uid
  const wrapperRegex = /<div[^>]+data-lia-message-uid="([^"]*)"[^>]*class="[^"]*lia-message-view-wrapper[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*lia-message-view-wrapper|$)/gi;
  let match;

  while ((match = wrapperRegex.exec(html)) !== null && results.length < limit) {
    const postId = match[1];
    const seg = match[2].slice(0, 60000); // safety cap

    // Title + URL
    const titleMatch =
      seg.match(
        /<h2[^>]*class="[^"]*message-subject[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
      ) ||
      seg.match(
        /<a[^>]+class="page-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
      );

    const url = titleMatch ? absolutize(decodeEntities(titleMatch[1])) : "";
    const title = titleMatch ? stripTags(titleMatch[2]) : "";
    if (!title || !url) continue;

    // Author
    // Look for "View Profile of ..." or the user link block
    let author = "";
    const authorMatch =
      seg.match(/viewprofilepage\/user-id\/\d+[^>]*>([^<]+)/i) ||
      seg.match(/class="[^"]*lia-user-name-link[^"]*"[^>]*>([^<]+)/i);
    if (authorMatch) author = stripTags(authorMatch[1]);

    // Date/time
    const dateMatch = seg.match(/class="local-date"[^>]*>([^<]+)</i);
    const timeMatch = seg.match(/class="local-time"[^>]*>([^<]+)</i);
    const published = dateMatch
      ? `${stripTags(dateMatch[1])}${timeMatch ? " " + stripTags(timeMatch[1]) : ""}`
      : undefined;

    // Likes (Kudos)
    const likesMatch = seg.match(/Kudos Count\s+(\d+)/i);
    const likes = likesMatch ? Number(likesMatch[1]) : undefined;

    // Snippet
    const snippetMatch = seg.match(
      /<div[^>]*class="[^"]*lia-truncated-body-container[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );
    const snippet = snippetMatch ? stripTags(snippetMatch[1]).slice(0, 280) : undefined;

    // Tags
    const tagSectionMatch = seg.match(
      /<div[^>]*class="[^"]*TagList[^"]*"[^>]*>[\s\S]*?<\/div>/i
    );
    const tags: string[] = [];
    if (tagSectionMatch) {
      const tagLinks = tagSectionMatch[0].matchAll(
        /<a[^>]*class="[^"]*lia-tag[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
      );
      for (const m of tagLinks) {
        const t = stripTags(m[1]);
        if (t) tags.push(t);
      }
    }

    results.push({ title, url, author, published, likes, snippet, tags, postId });
  }

  return results;
}

export async function searchCommunityBestMatch(
  query: string,
  opts: Options = {}
): Promise<BestMatchHit[]> {
  const { includeBlogs = true, limit = 10, userAgent } = opts;
  const url = buildSearchUrl(query, includeBlogs);
  const html = await fetchText(url, userAgent);
  return parseHitsFromHtml(html, limit);
}

// Convenience function: Search and get full content of top N posts in one call
export async function searchAndGetTopPosts(
  query: string, 
  topN: number = 3,
  opts: Options = {}
): Promise<{ search: BestMatchHit[], posts: { [id: string]: string } }> {
  // First, search for posts
  const searchResults = await searchCommunityBestMatch(query, { ...opts, limit: Math.max(topN, opts.limit || 10) });
  
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

// Function to get full post content by scraping the post page
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
      select body, id, subject, search_snippet, post_time 
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
      
      const content = `# ${post.subject}

**Source**: SAP Community Blog Post  
**Published**: ${postDate}  
**URL**: https://community.sap.com/t5/technology-blogs-by-sap/bg-p/t/${post.id}

---

${post.body || post.search_snippet}

---

*This content is from the SAP Community and represents community knowledge and experiences.*`;

      results[post.id] = content;
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

export async function getCommunityPostByUrl(postUrl: string, userAgent?: string): Promise<string | null> {
  try {
    const html = await fetchText(postUrl, userAgent);
    
    // Extract title - try multiple selectors
    let title = "Untitled";
    const titleSelectors = [
      /<h1[^>]*class="[^"]*lia-message-subject[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
      /<h2[^>]*class="[^"]*message-subject[^"]*"[^>]*>([\s\S]*?)<\/h2>/i,
      /<title>([\s\S]*?)<\/title>/i
    ];
    
    for (const selector of titleSelectors) {
      const titleMatch = html.match(selector);
      if (titleMatch) {
        title = stripTags(titleMatch[1]).replace(/\s*-\s*SAP Community.*$/, '').trim();
        break;
      }
    }
    
    // Extract author and date - multiple patterns
    let author = "Unknown";
    const authorSelectors = [
      /class="[^"]*lia-user-name-link[^"]*"[^>]*>([^<]+)/i,
      /viewprofilepage\/user-id\/\d+[^>]*>([^<]+)/i,
      /"author"[^>]*>[\s\S]*?<[^>]*>([^<]+)/i
    ];
    
    for (const selector of authorSelectors) {
      const authorMatch = html.match(selector);
      if (authorMatch) {
        author = stripTags(authorMatch[1]);
        break;
      }
    }
    
    // Extract date and time
    const dateMatch = html.match(/class="local-date"[^>]*>([^<]+)</i);
    const timeMatch = html.match(/class="local-time"[^>]*>([^<]+)</i);
    const published = dateMatch
      ? `${stripTags(dateMatch[1])}${timeMatch ? " " + stripTags(timeMatch[1]) : ""}`
      : "Unknown";
    
    // Extract main content - try multiple content selectors
    let content = "Content not available";
    const contentSelectors = [
      /<div[^>]*class="[^"]*lia-message-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*lia-message-body-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*messageBody[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    ];
    
    for (const selector of contentSelectors) {
      const contentMatch = html.match(selector);
      if (contentMatch) {
        // Clean up the content - remove script tags, preserve some formatting
        let rawContent = contentMatch[1]
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<iframe[\s\S]*?<\/iframe>/gi, '[Embedded Content]');
        
        // Convert some HTML elements to markdown-like format
        rawContent = rawContent
          .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, level, text) => {
            const hashes = '#'.repeat(parseInt(level) + 1);
            return `\n${hashes} ${stripTags(text)}\n`;
          })
          .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
          .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
          .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
          .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n')
          .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '$1')
          .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
        
        content = stripTags(rawContent).replace(/\n\s*\n\s*\n/g, '\n\n').trim();
        break;
      }
    }
    
    // Extract tags
    const tagSectionMatch = html.match(
      /<div[^>]*class="[^"]*TagList[^"]*"[^>]*>[\s\S]*?<\/div>/i
    );
    const tags: string[] = [];
    if (tagSectionMatch) {
      const tagLinks = tagSectionMatch[0].matchAll(
        /<a[^>]*class="[^"]*lia-tag[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
      );
      for (const m of tagLinks) {
        const t = stripTags(m[1]);
        if (t) tags.push(t);
      }
    }
    
    // Extract kudos count
    let kudos = 0;
    const kudosMatch = html.match(/(\d+)\s+Kudos?/i);
    if (kudosMatch) {
      kudos = parseInt(kudosMatch[1]);
    }
    
    const tagsText = tags.length > 0 ? `\n**Tags:** ${tags.join(", ")}` : "";
    const kudosText = kudos > 0 ? `\n**Kudos:** ${kudos}` : "";
    
    return `# ${title}

**Source**: SAP Community Blog Post  
**Author**: ${author}  
**Published**: ${published}${kudosText}${tagsText}  
**URL**: ${postUrl}

---

${content}

---

*This content is from the SAP Community and represents community knowledge and experiences.*`;
  } catch (error) {
    console.warn('Failed to get community post:', error);
    return null;
  }
}