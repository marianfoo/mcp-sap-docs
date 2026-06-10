import { createHash } from "node:crypto";
import {
  SearchResponse, 
  SearchResult, 
  SapHelpSearchResponse, 
  SapHelpMetadataResponse, 
  SapHelpPageContentResponse 
} from "./types.js";
import { truncateContent } from "./truncate.js";
import { htmlToMarkdown } from "./htmlToMarkdown.js";

const BASE = "https://help.sap.com";

/**
 * Structured citation for a SAP Help document: the stable cross-release identity
 * (`loio`), the resolved page title/url, and the exact deliverable build the
 * content came from. `deliverableId`/`buildNo` are only available on the full LOIO
 * fetch path; the no-LOIO branch leaves them (and `loio`) undefined/null.
 */
export interface SapHelpCitation {
  loio?: string | null;
  product?: string;
  /**
   * The version the caller asked for, parsed from the id suffix ("2025.001"); undefined when
   * the id carried no version (i.e. latest was requested). Compare against `version` to detect
   * whether version-pinning succeeded or the fetch fell back to latest.
   */
  requestedVersion?: string;
  /**
   * The build actually served. On a successful pinned fetch this equals `requestedVersion`;
   * when the pinned build is unavailable and the fetch falls back to latest (or no version was
   * requested), it is the SAP Help API's display string for what came back (e.g. "2025 FPS01").
   * So it also reveals what "latest" currently resolves to.
   */
  version?: string;
  language?: string;
  url?: string;
  title?: string;
  // The SAP Help API returns these as numbers; keep them faithful rather than coercing.
  deliverableId?: string | number;
  buildNo?: string | number;
}

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

function validLoio(loio?: string): string | null {
  if (!loio || loio === 'undefined' || loio === 'null') {
    return null;
  }

  return loio;
}

function deriveSapHelpId(hit: any, index = 0): string {
  const loio = validLoio(hit.loio);
  if (loio) {
    return loio;
  }

  const absoluteUrl = hit.url ? ensureAbsoluteUrl(hit.url) : '';
  let slug = '';
  try {
    const url = new URL(absoluteUrl || BASE);
    slug = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '')
      .replace(/\.(?:html?|pdf)$/i, '')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  } catch {
    // Fall back to a hash-only id below.
  }

  const hashInput = absoluteUrl || hit.title || String(index);
  const hash = createHash('sha1').update(hashInput).digest('hex').slice(0, 12);
  return slug ? `url-${slug}-${hash}` : `url-${hash}`;
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
 * Search SAP Help using the private elasticsearch endpoint.
 *
 * @param version Optional SAP Help docs-portal version filter. Accepts either a full
 *   `YYYY.FPS` string (e.g. "2022.002" = S/4HANA 2022 FPS02) or a bare release year
 *   (e.g. "2022" = that release's "Latest"). Empty/undefined → unfiltered (Latest across
 *   all versions, the prior behaviour). The endpoint filters server-side on this value.
 */
export async function searchSapHelp(query: string, version?: string): Promise<SearchResponse> {
  try {
    const v = (version ?? "").trim();
    const searchParams = {
      transtype: "standard,html,pdf,others",
      state: "PRODUCTION,TEST,DRAFT",
      product: "",
      version: v,
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
    const searchResults: SearchResult[] = results.map((hit, index) => {
      const helpId = deriveSapHelpId(hit, index);
      // Encode the requested version into the id so a later `fetch` can retrieve the
      // version-correct content without the caller re-supplying it. No version → plain id
      // (prior behaviour). getSapHelpContent parses the `--v<version>` suffix back off.
      const sapHelpId = v ? `sap-help-${helpId}--v${v}` : `sap-help-${helpId}`;

      return {
        library_id: sapHelpId,
        topic: '',
        id: sapHelpId,
        title: hit.title,
        url: ensureAbsoluteUrl(hit.url),
        snippet: `${hit.snippet || hit.title} — Product: ${hit.product || hit.productId || "Unknown"} (${hit.version || hit.versionId || "Latest"})`,
        score: 0,
        metadata: {
          source: "help",
          loio: validLoio(hit.loio),
          product: hit.product || hit.productId,
          version: hit.version || hit.versionId,
          rank: index + 1
        },
        // Legacy fields for backward compatibility
        description: `${hit.snippet || hit.title} — Product: ${hit.product || hit.productId || "Unknown"} (${hit.version || hit.versionId || "Latest"})`,
        totalSnippets: 1,
        source: "help"
      };
    });

    // Store the full search results in a simple cache for retrieval
    // In a real implementation, you might want a more sophisticated cache
    if (!global.sapHelpSearchCache) {
      global.sapHelpSearchCache = new Map();
    }
    results.forEach((hit, index) => {
      const helpId = deriveSapHelpId(hit, index);
      global.sapHelpSearchCache!.set(helpId, hit);
      const loio = validLoio(hit.loio);
      if (loio) {
        global.sapHelpSearchCache!.set(loio, hit);
      }
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
  return (await getSapHelpDocument(resultId)).text;
}

/**
 * Like `getSapHelpContent`, but also returns the structured citation (loio / product /
 * version / url / title plus the resolved deliverable build). The fetch handler uses this
 * to surface citation metadata; `getSapHelpContent` is the thin string-only wrapper kept
 * unchanged for existing callers.
 */
export async function getSapHelpDocument(
  resultId: string
): Promise<{ text: string; citation: SapHelpCitation }> {
  // Parse the optional version suffix encoded by search ("sap-help-<loio>--v<version>") so
  // fetch retrieves the same release the caller searched. No suffix → latest (prior behaviour).
  // (loio ids are hex and url-slug ids are sanitised, so "--v" only appears as our delimiter.)
  const raw = resultId.replace('sap-help-', '');
  if (!raw || raw === resultId) {
    throw new Error("Invalid SAP Help result ID. Use an ID from sap_help_search results.");
  }
  const sepIdx = raw.indexOf('--v');
  const helpId = sepIdx >= 0 ? raw.slice(0, sepIdx) : raw;
  const version = sepIdx >= 0 ? (raw.slice(sepIdx + 3).trim() || undefined) : undefined;

  // Try the version-specific content first; on empty/error fall back ONCE to the default
  // (latest) path — exactly what fetch returned before this feature, so we are never worse
  // than the prior behaviour. This is not a retry of the same request: the fallback is a
  // different, known-good request (the pre-version code path).
  let resolved = await resolveSapHelpContent(helpId, version);
  if (resolved === null && version) {
    resolved = await resolveSapHelpContent(helpId, undefined);
  }
  if (resolved === null) {
    throw new Error(`Failed to get SAP Help content for ${helpId}`);
  }
  // requestedVersion is known only here (the inner resolve sees `undefined` on the fallback
  // call, so it can't record what was originally asked for). Stamp it on the citation so the
  // caller can compare requested-vs-served and tell whether pinning held or fell back.
  return { text: resolved.content, citation: { ...resolved.citation, requestedVersion: version } };
}

/**
 * Resolve SAP Help page content for a loio at a given version.
 * Returns rendered markdown, or `null` when content can't be retrieved (so the caller can
 * fall back). `version`:
 *   - undefined → default/latest path, byte-for-byte the pre-version behaviour
 *   - set       → version-pinned: re-search for that release's deliverable and request the
 *                 version-matched build (older "LATEST" builds can be partial/500 on some pages)
 */
async function resolveSapHelpContent(
  helpId: string,
  version?: string
): Promise<{ content: string; citation: SapHelpCitation } | null> {
  const reSearchVersion = version ?? "";        // "" = latest (prior behaviour)
  const metadataVersion = version ?? "LATEST";  // version-matched build, else latest
  try {
    // With a requested version, always re-search version-pinned so we get THAT release's
    // deliverable — the shared cache is keyed by loio only and may hold a different version.
    const cache = global.sapHelpSearchCache || new Map();
    let hit = version ? undefined : cache.get(helpId);

    if (!hit) {
      const searchParams = {
        transtype: "standard,html,pdf,others",
        state: "PRODUCTION,TEST,DRAFT",
        product: "",
        version: reSearchVersion,
        q: helpId, // Search by LOIO or stable derived id to find the specific document
        to: "19",
        area: "content",
        advancedSearch: "0",
        excludeNotSearchable: "1",
        language: "en-US",
      };
      const searchUrl = `${BASE}/http.svc/elasticsearch?${toQuery(searchParams)}`;
      const searchResponse = await fetch(searchUrl, {
        headers: { Accept: "application/json", "User-Agent": "mcp-sap-docs/help-get", Referer: BASE },
      });
      if (!searchResponse.ok) return null;
      const searchData: SapHelpSearchResponse = await searchResponse.json();
      const results = searchData?.data?.results || [];
      hit = results.find((r, index) => validLoio(r.loio) === helpId || deriveSapHelpId(r, index) === helpId);
      if (!hit) return null;
    }

    if (!validLoio(hit.loio)) {
      const fullContent = `# ${hit.title}

**Source:** SAP Help Portal
**URL:** ${ensureAbsoluteUrl(hit.url)}
**Product:** ${hit.product || hit.productId || "Unknown"}
**Version:** ${hit.version || hit.versionId || "Latest"}
**Language:** ${hit.language || "en-US"}
${hit.snippet ? `**Summary:** ${hit.snippet}` : ''}

---

This SAP Help search result does not expose a LOIO page id through the search API, so only the searchable metadata and canonical URL are available.

---

*This content is from the SAP Help Portal and represents official SAP documentation.*`;
      const citation: SapHelpCitation = {
        loio: null,
        product: hit.product || hit.productId,
        version: version || hit.version || hit.versionId,
        language: hit.language || "en-US",
        url: ensureAbsoluteUrl(hit.url),
        title: hit.title,
      };
      return { content: truncateContent(fullContent).content, citation };
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
      if (!product_url) return null;
    }

    const language = hit.language || "en-US";

    const metadataParams = {
      product_url,
      topic_url,
      version: metadataVersion,
      loadlandingpageontopicnotfound: "true",
      deliverable_url,
      language,
      deliverableInfo: "1",
      toc: "1",
    };
    const metadataUrl = `${BASE}/http.svc/deliverableMetadata?${toQuery(metadataParams)}`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: { Accept: "application/json", "User-Agent": "mcp-sap-docs/help-metadata", Referer: BASE },
    });
    if (!metadataResponse.ok) return null;

    const metadataData: SapHelpMetadataResponse = await metadataResponse.json();
    const deliverable_id = metadataData?.data?.deliverable?.id;
    const buildNo = metadataData?.data?.deliverable?.buildNo;
    const file_path = metadataData?.data?.filePath || topic_url;
    if (!deliverable_id || !buildNo || !file_path) return null;

    const pageParams = { deliverableInfo: "1", deliverable_id, buildNo, file_path };
    const pageUrl = `${BASE}/http.svc/pagecontent?${toQuery(pageParams)}`;
    const pageResponse = await fetch(pageUrl, {
      headers: { Accept: "application/json", "User-Agent": "mcp-sap-docs/help-content", Referer: BASE },
    });
    if (!pageResponse.ok) return null;

    const pageData: SapHelpPageContentResponse = await pageResponse.json();
    const title = pageData?.data?.currentPage?.t || pageData?.data?.deliverable?.title || hit.title;
    const bodyHtml = pageData?.data?.body || "";
    if (!bodyHtml) return null; // empty body → allow fallback to the default path

    // Convert the HTML fragment to Markdown, preserving tables, nested lists and code.
    const cleanText = htmlToMarkdown(bodyHtml);

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

    const citation: SapHelpCitation = {
      loio: hit.loio,
      product: hit.product || hit.productId || product_url,
      version: version || hit.version || hit.versionId,
      language,
      url: ensureAbsoluteUrl(hit.url),
      title,
      deliverableId: deliverable_id,
      buildNo,
    };
    return { content: truncateContent(fullContent).content, citation };
  } catch {
    return null; // any error → allow fallback (caller throws if no path succeeds)
  }
}
