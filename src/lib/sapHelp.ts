import { createHash } from "node:crypto";
import {
  SearchResponse,
  SearchResult,
  SapHelpSearchResult,
  SapHelpSearchResponse,
  SapHelpMetadataResponse,
  SapHelpPageContentResponse
} from "./types.js";
import { truncateContent } from "./truncate.js";
import { htmlToMarkdown } from "./htmlToMarkdown.js";

const BASE = "https://help.sap.com";

// SAP Help search requests only the transtypes that `fetch` can actually render: fetch resolves the
// `pagecontent` HTML fragment → htmlToMarkdown (resolveSapHelpContent), so PDF/"others" hits are
// dead-ends on fetch (and pure noise in search). Single source of truth so search capability follows
// fetch capability — extend only when a new renderer lands (e.g. a PDF→MD converter). Used by both
// elasticsearch request sites below. Verified 2026-06-19: "standard,html" returns the identical
// html5.uacp topic set as "standard,html,pdf,others", minus the unfetchable PDFs.
const FETCHABLE_TRANSTYPES = "standard,html";

// abapFlavor → SAP Help content-index `product` facet, to scope the online leg so conceptual ABAP
// queries draw semantic matches from ABAP docs only, not the whole cross-product corpus (which
// outranked correct local hits — the online-merge pollution bug; see test/eval/candidate-probes.md).
// PROVENANCE: `ABAP_PLATFORM_NEW` is NOT a catalogued product (absent from topproducts; no version
// axis) — it is an internal content-index facet, validated empirically 2026-06-19 to return ABAP
// Platform docs (latest only, versionId 202510.001). If it ever stops returning hits, fall back to
// the catalog-named `SAP_NETWEAVER_AS_ABAP_752`. `ABAP_ENVIRONMENT` IS a real product (version "Cloud").
export const ABAP_HELP_PRODUCTS: Record<'standard' | 'cloud', string> = {
  standard: "ABAP_PLATFORM_NEW",
  cloud: "ABAP_ENVIRONMENT",
};

// Result-id encoding for the search↔fetch round-trip. A help id is either a loio (hex) or a
// sanitised "url-<slug>-<hash>" — both live in [A-Za-z0-9_-] and can never contain "~", so we use
// it as the version delimiter and let the opaque versionId ride through verbatim (see encodeSapHelpId).
const ID_PREFIX = "sap-help-";
const VERSION_SEP = "~";

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
   * The exact, pinnable SAP Help version token of the SERVED document (e.g. "2025.001", "2.0.08",
   * "Cloud"). Pass it straight back as search's `version` to pin a follow-up to the same release —
   * no guessing. Compare with `requestedVersion`: if they differ, the pinned build was unavailable
   * and the fetch fell back to latest. Always present when SAP Help exposes a version.
   */
  versionId?: string;
  /** Human display label of the served release (e.g. "2025 FPS01 (Feb 2026)") — for showing, not filtering. */
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

/** One raw SAP Help search request. Returns the hit array (empty if none); throws on HTTP error. */
async function fetchHelpResults(query: string, version: string, product = ""): Promise<SapHelpSearchResult[]> {
  const searchParams = {
    transtype: FETCHABLE_TRANSTYPES,
    state: "PRODUCTION,TEST,DRAFT",
    product,
    version,
    q: query,
    to: "19", // Limit to 20 results (0-19)
    area: "content",
    advancedSearch: "0",
    excludeNotSearchable: "1",
    language: "en-US",
  };
  const response = await fetch(`${BASE}/http.svc/elasticsearch?${toQuery(searchParams)}`, {
    headers: { Accept: "application/json", "User-Agent": "mcp-sap-docs/help-search", Referer: BASE },
  });
  if (!response.ok) {
    throw new Error(`SAP Help search failed: ${response.status} ${response.statusText}`);
  }
  const data: SapHelpSearchResponse = await response.json();
  return data?.data?.results || [];
}

/**
 * Relaxation ladder for the two independent, OPTIONAL SAP Help filters — a `version` pin and a
 * `product` scope. Tries the most specific combo first, then relaxes the PRODUCT scope (an optional
 * noise filter, and the value most likely to be a wrong/guessed slug) BEFORE the VERSION pin (the
 * caller's explicit release constraint) — so a bad product never silently swaps the requested
 * release. The final attempt is unscoped-latest = the original pre-filter behaviour, so the leg is
 * never lost. Returns the hits plus the version that actually produced them (drives id encoding).
 *
 * `fetcher` is injected so the ladder is unit-testable without the network (see
 * test/help-fallback-ladder.test.ts). Combos that collapse to a duplicate when version/product is
 * empty are de-duplicated, so no combination is ever fetched twice.
 */
export async function resolveHelpResults(
  fetcher: (query: string, version: string, product: string) => Promise<SapHelpSearchResult[]>,
  query: string,
  requested: string,
  scope: string,
): Promise<{ results: SapHelpSearchResult[]; usedVersion: string }> {
  const attempts: Array<[string, string]> = [];
  const add = (v: string, p: string) => {
    if (!attempts.some(([av, ap]) => av === v && ap === p)) attempts.push([v, p]);
  };
  add(requested, scope); // most specific
  add(requested, "");    // drop product (noise filter), KEEP the version pin
  add("", scope);        // drop version, keep the product scope
  add("", "");           // drop both = prior unscoped-latest behaviour

  let results: SapHelpSearchResult[] = [];
  for (const [v, p] of attempts) {
    results = await fetcher(query, v, p);
    if (results.length) return { results, usedVersion: v };
  }
  return { results, usedVersion: requested }; // all empty — usedVersion is unused downstream
}

export async function searchSapHelp(query: string, version?: string, product?: string): Promise<SearchResponse> {
  try {
    const requested = (version ?? "").trim();
    const scope = (product ?? "").trim();
    // Resolve the two optional filters via the relaxation ladder: it relaxes a wrong/empty PRODUCT
    // before the caller's VERSION pin and never goes below unscoped-latest, so the leg is never lost
    // and a bad product never silently swaps the requested release. `usedVersion` then drives id
    // encoding, so a later fetch follows whichever release actually answered. See resolveHelpResults.
    const { results, usedVersion } = await resolveHelpResults(fetchHelpResults, query, requested, scope);

    if (!results.length) {
      return {
        results: [],
        error: `No SAP Help results found for "${query}"`
      };
    }

    // Store the search results for later retrieval
    const searchResults: SearchResult[] = results.map((hit, index) => {
      const helpId = deriveSapHelpId(hit, index);
      // Encode the release into the id so a later `fetch` retrieves the SAME release with no extra
      // parameter (see encodeSapHelpId). No version → plain id (prior behaviour).
      const sapHelpId = encodeSapHelpId(helpId, usedVersion);

      // Surface the exact filter tokens (versionId, productId) verbatim: both are opaque,
      // case-sensitive and unguessable, so the caller pins a later search by copying them from a
      // result, not deriving them. `product` is the human display label (e.g. "SAP S/4HANA");
      // `productId` is the actual scope facet (e.g. "SAP_S4HANA_ON-PREMISE") — they differ for most
      // functional products, so the label is NOT a usable `product` filter. Show the id when it adds info.
      const versionToken = hit.versionId || "";
      const versionLabel = hit.version || hit.versionId || "Latest";
      const versionText = versionToken ? `${versionLabel}, versionId ${versionToken}` : versionLabel;
      const productLabel = hit.product || hit.productId || "Unknown";
      const productId = hit.productId || hit.product || "";
      const productText = productId && productId !== productLabel
        ? `${productLabel}, productId ${productId}`
        : productLabel;
      const desc = `${hit.snippet || hit.title} — Product: ${productText} (${versionText})`;

      return {
        library_id: sapHelpId,
        topic: '',
        id: sapHelpId,
        title: hit.title,
        url: ensureAbsoluteUrl(hit.url),
        snippet: desc,
        score: 0,
        metadata: {
          source: "help",
          loio: validLoio(hit.loio),
          product: productLabel,
          productId: productId || undefined,
          version: versionLabel,
          versionId: versionToken || undefined,
          rank: index + 1
        },
        // Legacy fields for backward compatibility
        description: desc,
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
 * Encode/parse the release into a search-result id so `fetch` retrieves the same release the
 * caller searched, with no extra parameter. The version is the SAP Help `versionId` — an opaque,
 * exact, case-sensitive token whose shape varies across products ("2025.001", "2.0.08", "10.0",
 * "2211", "Cloud", "2026_06"), so it is carried verbatim after the reserved "~" delimiter (which
 * help ids never contain). No version → plain id. parseSapHelpId returns helpId "" for a
 * malformed (non-"sap-help-") id so the caller can reject it.
 */
export function encodeSapHelpId(helpId: string, version?: string): string {
  const v = (version ?? "").trim();
  return v ? `${ID_PREFIX}${helpId}${VERSION_SEP}${v}` : `${ID_PREFIX}${helpId}`;
}

export function parseSapHelpId(resultId: string): { helpId: string; version?: string } {
  const raw = resultId.startsWith(ID_PREFIX) ? resultId.slice(ID_PREFIX.length) : "";
  const i = raw.indexOf(VERSION_SEP);
  return i < 0
    ? { helpId: raw, version: undefined }
    : { helpId: raw.slice(0, i), version: raw.slice(i + 1) || undefined };
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
  // fetch retrieves the same release the caller searched: search encodes the version into the
  // id, parseSapHelpId pulls it back off. No suffix → latest (prior behaviour).
  const { helpId, version } = parseSapHelpId(resultId);
  if (!helpId) {
    throw new Error("Invalid SAP Help result ID. Use an ID from sap_help_search results.");
  }

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
        transtype: FETCHABLE_TRANSTYPES,
        state: "PRODUCTION,TEST,DRAFT",
        // No product scope on the fetch-by-id re-search: the query is the loio/derived id (already
        // document-specific), and fetch carries no abapFlavor context. Only relax noise via transtype.
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
        versionId: hit.versionId,                  // pinnable token of the served doc
        version: hit.version || hit.versionId,     // human display label
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
      versionId: hit.versionId,                  // pinnable token of the served doc
      version: hit.version || hit.versionId,     // human display label
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
