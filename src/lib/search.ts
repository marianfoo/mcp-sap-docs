// Unified ABAP/RAP search using FTS5 with optional online sources
import { searchFTS } from "./searchDb.js";
import { CONFIG } from "./config.js";
import { loadMetadata, getSourceBoosts, expandQueryTerms, getContextBoosts, getAllContextBoosts } from "./metadata.js";
import { searchSapHelp } from "./sapHelp.js";
import { searchCommunity } from "./localDocs.js";
import { searchSoftwareHeroesContent } from "./softwareHeroes/index.js";
import { SearchResponse, SearchResult as ApiSearchResult } from "./types.js";

export type SearchResult = {
  id: string;
  text: string;
  bm25: number;
  sourceId: string;
  path: string;
  relFile: string;
  finalScore: number;
  sourceKind: 'offline' | 'sap_help' | 'sap_community' | 'software_heroes';
  // Debug info for ranking analysis
  debug?: {
    bm25Score?: number;
    rank?: number;
    rrfScore?: number;
    boost?: number;
  };
};

export interface UnifiedSearchOptions {
  k?: number;
  includeOnline?: boolean;
  includeSamples?: boolean;
  abapFlavor?: 'standard' | 'cloud' | 'auto';
  sources?: string[];
}

// Timeout constant for online sources (10 seconds)
const ONLINE_TIMEOUT_MS = CONFIG.SOFTWARE_HEROES_TIMEOUT_MS;

// RRF (Reciprocal Rank Fusion) constants
// k parameter controls how much weight early ranks get vs later ranks
// Higher k = more even weighting across ranks
const RRF_K = 60;

// Source weights for RRF fusion
const RRF_WEIGHTS = {
  offline: 1.0,        // Full weight for offline (indexed) results
  sap_help: 0.9,       // Slightly lower for SAP Help
  sap_community: 0.6,  // Lower for community (can be noisy)
  software_heroes: 0.85 // Software-Heroes (high quality ABAP/RAP tutorials)
};

/**
 * Reciprocal Rank Fusion scoring
 * RRF(rank) = 1 / (k + rank) where k=60 is standard
 * This converts rank positions to a normalized score
 */
function rrf(rank: number, k = RRF_K): number {
  return 1 / (k + rank);
}

/**
 * Canonicalize URL for deduplication
 * Strips query params that create duplicates (locale, state, version)
 */
function canonicalUrl(u: string): string {
  try {
    const url = new URL(u);
    // Remove params that create duplicate entries
    url.searchParams.delete("locale");
    url.searchParams.delete("state");
    url.searchParams.delete("version");
    url.searchParams.delete("q"); // search query param
    url.search = url.searchParams.toString() ? `?${url.searchParams.toString()}` : "";
    return url.toString().toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

/**
 * Generate dedupe key based on source kind
 * - Offline: sourceId + document ID (unique within index)
 * - Online: canonical URL (strips irrelevant params)
 */
function dedupeKey(r: SearchResult): string {
  if (r.sourceKind === "offline") {
    return `offline:${r.sourceId}:${r.id}`;
  }
  // For online results, use canonical URL
  return `online:${r.sourceKind}:${canonicalUrl(r.path || r.id)}`;
}

/**
 * Detect implementation intent from query
 * Returns true if user is looking for code examples/samples
 */
function hasImplementationIntent(query: string): boolean {
  return /\b(example|sample|code|implementation|how\s*to|bdef|handler|behavior\s+implementation|snippet|tutorial)\b/i.test(query);
}

/**
 * Detect clean code / best practice intent from query
 */
function hasCleanCodeIntent(query: string): boolean {
  return /\b(clean\s*code|naming\s*convention|best\s*practice|style\s*guide|coding\s*standard)\b/i.test(query);
}

/**
 * Detect if query is specifically about news/releases
 */
function hasNewsIntent(query: string): boolean {
  return /\b(news|release|update|new\s+in|what'?s\s*new)\b/i.test(query);
}

/**
 * Extract annotation patterns from query (e.g., @UI.lineItem, @ObjectModel)
 */
function extractAnnotationPatterns(query: string): string[] {
  // Match @Namespace.annotationName patterns
  const matches = query.match(/@[A-Za-z]+(\.[A-Za-z]+)?/g);
  return matches || [];
}

/**
 * Detect if query is about annotations
 */
function hasAnnotationQuery(query: string): boolean {
  return query.includes('@') || /\b(annotation)\b/i.test(query);
}

/**
 * Detect query context for contextBoosts
 * Returns matching context keys from metadata
 */
function detectQueryContexts(query: string): string[] {
  const contexts: string[] = [];
  const lower = query.toLowerCase();
  
  // RAP-related
  if (/\b(rap|behavior|bdef|eml|managed|unmanaged)\b/i.test(query)) {
    contexts.push('rap');
  }
  // CDS-related
  if (/\b(cds|annotation|@ui|view|entity)\b/i.test(query)) {
    contexts.push('cds');
  }
  // Fiori-related
  if (/\b(fiori|launchpad|flp|tile|ui5)\b/i.test(query)) {
    contexts.push('fiori');
  }
  // ABAP general
  if (/\babap\b/i.test(query)) {
    contexts.push('abap');
  }
  
  return contexts;
}

// Helper to extract source ID from library_id or document path
// Returns the raw source ID (e.g., 'abap-docs-standard') for boost lookups
function extractSourceId(libraryIdOrPath: string): string {
  if (libraryIdOrPath.startsWith('/')) {
    const parts = libraryIdOrPath.split('/');
    if (parts.length > 1) {
      return parts[1]; // Return raw source ID without mapping
    }
  }
  return libraryIdOrPath;
}

// Create a promise that rejects after timeout
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    )
  ]);
}

/**
 * Process a single online source result into SearchResult[] with RRF scoring
 * Consolidates the repeated pattern used for SAP Help, Community, and Software-Heroes
 */
function processOnlineSource(
  settled: PromiseSettledResult<SearchResponse>,
  sourceName: string,
  sourceKind: SearchResult['sourceKind'],
  rrfWeight: number,
  boost: number,
  maxResults = 10
): SearchResult[] {
  if (settled.status !== 'fulfilled') {
    const reason = (settled as PromiseRejectedResult).reason;
    console.warn(`❌ [${sourceName}] Failed or timed out:`, reason?.message || reason);
    return [];
  }

  const response = settled.value as SearchResponse;

  if (response?.error) {
    console.warn(`⚠️ [${sourceName}] ${response.error}`);
  }

  if (!response?.results || response.results.length === 0) {
    console.log(`⚠️ [${sourceName}] No results`);
    return [];
  }

  const results: SearchResult[] = response.results.slice(0, maxResults).map((r, idx) => {
    const rank = idx + 1;
    const rrfScore = rrf(rank) * rrfWeight;
    const finalScore = rrfScore * (1 + boost);

    return {
      id: r.id || `${sourceKind}-${idx}`,
      text: `${r.title || ''}\n\n${r.description || r.snippet || ''}\n\n${r.url || ''}`,
      bm25: 0,
      sourceId: sourceKind.replace(/_/g, '-'),
      path: r.url || '',
      relFile: '',
      finalScore,
      sourceKind,
      debug: { rank, rrfScore, boost }
    };
  });

  console.log(`✅ [${sourceName}] ${results.length} results (boost=${boost.toFixed(2)})`);
  return results;
}

// Determine ABAP flavor from query and explicit parameter
function determineAbapFlavor(query: string, explicitFlavor?: 'standard' | 'cloud' | 'auto'): 'standard' | 'cloud' {
  // If explicit flavor is specified (not 'auto'), use it
  if (explicitFlavor && explicitFlavor !== 'auto') {
    return explicitFlavor;
  }
  
  // Auto-detect from query
  const cloudMatch = query.match(/\b(cloud|btp|steampunk)\b/i);
  const standardMatch = query.match(/\b(standard|on-?premise|onpremise)\b/i);
  
  if (cloudMatch && !standardMatch) {
    return 'cloud';
  }
  
  // Default to standard
  return 'standard';
}

// Sample-heavy sources (code repositories and cheat sheets)
const SAMPLE_SOURCES = [
  'openui5-samples',
  'cap-fiori-showcase',
  'abap-platform-rap-opensap',
  'cloud-abap-rap',
  'abap-platform-reuse-services',
  'abap-cheat-sheets',
  'abap-fiori-showcase'
];

// Language suffixes to filter out for multi-language sources (e.g., CleanABAP_de, CleanABAP_ja)
// These are translation duplicates of English content
const NON_ENGLISH_SUFFIXES = ['_de', '_ja', '_zh', '_fr', '_es', '_pt', '_ko', '_kr', '_ru'];

/**
 * Check if a result is a non-English variant of a multi-language source
 * Returns true if the result should be filtered out (is a translation duplicate)
 * Note: dsag-abap-leitfaden is NOT filtered as it's unique content, not a translation
 */
function isNonEnglishVariant(id: string, sourceId: string): boolean {
  // Only filter style guides that have language suffixes (CleanABAP_de, CleanABAP_ja, etc.)
  // Check if the path contains a language-suffixed directory
  for (const suffix of NON_ENGLISH_SUFFIXES) {
    if (id.includes(`/sap-styleguides/CleanABAP${suffix}/`) || 
        id.includes(`CleanABAP${suffix}`) ||
        sourceId.endsWith(suffix)) {
      return true;
    }
  }
  return false;
}

/**
 * Unified search across ABAP documentation sources
 * 
 * @param query - Search query string
 * @param options - Search options
 * @param options.k - Number of results to return (default: CONFIG.RETURN_K = 50)
 * @param options.includeOnline - Include SAP Help and Community searches (default: true)
 * @param options.includeSamples - Include sample repositories (default: true)
 * @param options.abapFlavor - ABAP flavor filter: 'standard', 'cloud', or 'auto' (default: 'auto')
 * @param options.sources - Specific source IDs to search (default: all ABAP sources)
 */
export async function search(
  query: string,
  options: UnifiedSearchOptions = {}
): Promise<SearchResult[]> {
  const {
    k = CONFIG.RETURN_K,
    includeOnline = true,  // Online search enabled by default for comprehensive results
    includeSamples = true,
    abapFlavor = 'auto',
    sources
  } = options;

  // Load metadata for boosts and query expansion
  loadMetadata();
  const sourceBoosts = getSourceBoosts();
  const allContextBoosts = getAllContextBoosts();
  
  // Expand query with synonyms and acronyms
  const queryVariants = expandQueryTerms(query);
  const seen = new Map<string, any>();
  
  // Determine ABAP flavor
  const requestedAbapFlavor = determineAbapFlavor(query, abapFlavor);
  
  // Check if query explicitly mentions ABAP (for extra boosting of official docs)
  const isExplicitAbapQuery = query.match(/\babap\b/i) !== null;
  
  // Detect query contexts for context-aware boosting
  const queryContexts = detectQueryContexts(query);
  
  // Detect implementation intent for sample boosting
  const wantsImplementation = hasImplementationIntent(query);
  
  // Search offline FTS database with all query variants (union approach)
  for (const variant of queryVariants) {
    try {
      const rows = searchFTS(variant, {}, k * 2); // Get more candidates for filtering
      for (const r of rows) {
        if (!seen.has(r.id)) {
          seen.set(r.id, r);
        }
      }
    } catch (error) {
      console.warn(`FTS query failed for variant "${variant}":`, error);
      continue;
    }
    if (seen.size >= k * 2) break; // enough candidates
  }
  
  let rows = Array.from(seen.values());
  
  // Filter by specific sources if provided
  if (sources && sources.length > 0) {
    rows = rows.filter(r => {
      const sourceId = extractSourceId(r.libraryId || r.id);
      return sources.includes(sourceId);
    });
  }
  
  // Filter samples if not requested
  if (!includeSamples) {
    rows = rows.filter(r => {
      const sourceId = extractSourceId(r.libraryId || r.id);
      return !SAMPLE_SOURCES.includes(sourceId);
    });
  }
  
  // Filter out non-English variants of multi-language sources (e.g., CleanABAP_de)
  // This keeps dsag-abap-leitfaden as it's unique content, not a translation duplicate
  rows = rows.filter(r => {
    const sourceId = extractSourceId(r.libraryId || r.id);
    return !isNonEnglishVariant(r.id || '', sourceId);
  });
  
  // Smart ABAP library filtering based on flavor
  if (requestedAbapFlavor === 'cloud') {
    // For cloud-specific queries, show cloud ABAP docs
    rows = rows.filter(r => {
      const id = r.id || '';
      
      // Keep all non-ABAP-docs sources (style guides, cheat sheets, samples, etc.)
      if (!id.includes('/abap-docs-')) return true;
      
      // For ABAP docs, ONLY keep cloud library
      return id.includes('/abap-docs-cloud/');
    });
    
    console.log(`Filtered to ABAP Cloud: ${rows.length} results`);
  } else {
    // For standard ABAP queries, show standard (on-premise) ABAP docs
    rows = rows.filter(r => {
      const id = r.id || '';
      
      // Keep all non-ABAP-docs sources (style guides, cheat sheets, samples, etc.)
      if (!id.includes('/abap-docs-')) return true;
      
      // For ABAP docs, ONLY keep standard library (default for on-premise)
      return id.includes('/abap-docs-standard/');
    });
    
    console.log(`Filtered to Standard ABAP (on-premise): ${rows.length} results`);
  }
  
  // CRITICAL: Take more candidates BEFORE merging with online results
  // This prevents relevant offline docs from being hidden by the early slice
  const candidateCount = Math.max(k * 5, 50);
  
  // Convert offline results to consistent format with source boosts
  // Each result gets a rank-based RRF score plus boost multipliers
  const offlineResults: SearchResult[] = rows.slice(0, candidateCount).map((r, index) => {
    const sourceId = extractSourceId(r.libraryId || r.id);
    let boost = sourceBoosts[sourceId] || 0;
    
    // Extra boost for official ABAP docs when "abap" is explicitly in the query
    // Reduced from 2.0 to 0.5 to prevent generic docs from outranking specific content
    if (isExplicitAbapQuery && r.id.includes('/abap-docs-')) {
      boost += 1.0;
    }
    
    // Additional boost for library-specific queries
    if (requestedAbapFlavor === 'cloud' && r.id.includes('/abap-docs-cloud/')) {
      boost += 1.0;
    } else if (requestedAbapFlavor === 'standard' && r.id.includes('/abap-docs-standard/')) {
      boost += 0.5;
    }
    
    // Apply context boosts from metadata
    for (const ctx of queryContexts) {
      const ctxBoosts = allContextBoosts[ctx];
      if (ctxBoosts) {
        // Check if this source's libraryId matches any boosted library
        const libraryId = r.libraryId || `/${sourceId}`;
        if (ctxBoosts[libraryId]) {
          boost += ctxBoosts[libraryId];
        }
      }
    }
    
    // Intent-based sample boosting
    if (wantsImplementation && SAMPLE_SOURCES.includes(sourceId)) {
      boost += 1.5; // Significant boost for samples when user wants implementation
    }
    
    // Title boosting: boost results where query terms appear in the title
    const title = (r.title || '').toLowerCase();
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    let titleMatchCount = 0;
    for (const term of queryTerms) {
      if (title.includes(term)) {
        titleMatchCount++;
      }
    }
    if (titleMatchCount > 0) {
      // Boost proportional to how many query terms match in title
      boost += 0.5 * titleMatchCount;
    }
    
    // Glossary down-ranking: slightly penalize glossary entries to prefer practical guides
    // Glossary entries are useful for definitions but often not what users want for "how to" queries
    if (r.id && r.id.includes('_GLOSRY')) {
      boost -= 0.3;
    }
    
    // Clean code intent: boost style guides significantly
    if (hasCleanCodeIntent(query) && sourceId === 'sap-styleguides') {
      boost += 3.0;
    }
    
    // Down-rank news articles for non-news queries
    if (r.id && r.id.includes('ABENNEWS-') && !hasNewsIntent(query)) {
      boost -= 0.8;
    }
    
    // Penalize example documents when user doesn't want examples
    const isExampleDoc = r.id && (r.id.includes('_ABEXA') || r.id.includes('_EXAMPLE'));
    if (isExampleDoc && !wantsImplementation) {
      boost -= 0.3;
    }
    
    // Annotation query handling
    const annotationPatterns = extractAnnotationPatterns(query);
    const isAnnotationQuery = hasAnnotationQuery(query);
    
    if (isAnnotationQuery) {
      const textLower = (r.text || r.description || '').toLowerCase();
      const idLower = (r.id || '').toLowerCase();
      
      // 1. Strong boost for results that contain the exact annotation pattern in text
      for (const pattern of annotationPatterns) {
        if (textLower.includes(pattern.toLowerCase())) {
          boost += 2.0; // Strong boost for exact annotation match in content
        }
      }
      
      // 2. Boost annotation definition docs (_ANNO files)
      if (idLower.includes('_anno')) {
        boost += 1.5;
      }
      
      // 3. Boost CDS annotation reference docs (ABENCDS_F1_)
      if (idLower.includes('abencds_f1_')) {
        boost += 1.0;
      }
      
      // 4. Penalize unrelated example docs for annotation queries
      if (r.id && r.id.includes('_ABEXA') && annotationPatterns.length > 0) {
        // Check if the example actually mentions the annotation
        let mentionsAnnotation = false;
        for (const pattern of annotationPatterns) {
          if (textLower.includes(pattern.toLowerCase())) {
            mentionsAnnotation = true;
            break;
          }
        }
        if (!mentionsAnnotation) {
          boost -= 1.0; // Penalize examples that don't mention the queried annotation
        }
      }
    }
    
    // Calculate RRF score based on BM25 rank (index)
    // rank is 1-based for RRF formula
    const rank = index + 1;
    const rrfScore = rrf(rank) * RRF_WEIGHTS.offline;
    
    // Final score = RRF score * boost multiplier
    // We use (1 + boost) so boost=0 gives multiplier of 1
    const finalScore = rrfScore * (1 + boost);
    
    return {
      id: r.id,
      text: `${r.title || ""}\n\n${r.description || ""}\n\n${r.id}`,
      bm25: r.bm25Score,
      sourceId,
      path: r.id,
      relFile: r.relFile || '',
      finalScore,
      sourceKind: 'offline' as const,
      debug: {
        bm25Score: r.bm25Score,
        rank,
        rrfScore,
        boost
      }
    };
  });
  
  // Optionally search online sources with timeout
  let onlineResults: SearchResult[] = [];
  
  if (includeOnline) {
    console.log(`🌐 [ONLINE] Starting online searches for "${query}" (${ONLINE_TIMEOUT_MS}ms timeout)...`);
    
    const onlineSearches = await Promise.allSettled([
      // SAP Help search with timeout
      withTimeout(searchSapHelp(query), ONLINE_TIMEOUT_MS, 'SAP Help search'),
      // SAP Community search with timeout  
      withTimeout(searchCommunity(query), ONLINE_TIMEOUT_MS, 'SAP Community search'),
      // Software-Heroes search with timeout - search both EN and DE languages
      // since content is available in both and query could be in either language
      withTimeout(
        (async (): Promise<SearchResponse> => {
          const [enResults, deResults] = await Promise.allSettled([
            searchSoftwareHeroesContent(query, { language: 'en' }),
            searchSoftwareHeroesContent(query, { language: 'de' })
          ]);
          
          // Merge results, deduplicating by URL
          const seenUrls = new Set<string>();
          const mergedResults: ApiSearchResult[] = [];
          
          for (const langResult of [enResults, deResults]) {
            if (langResult.status === 'fulfilled' && langResult.value.results) {
              for (const r of langResult.value.results) {
                if (r.url && !seenUrls.has(r.url)) {
                  seenUrls.add(r.url);
                  mergedResults.push(r);
                }
              }
            }
          }
          
          return {
            results: mergedResults,
            error: mergedResults.length === 0 ? 'No results from either language' : undefined
          };
        })(),
        ONLINE_TIMEOUT_MS,
        'Software-Heroes search'
      )
    ]);
    
    // Online boost makes results competitive with boosted offline results
    // Without this, offline context boosts (~1.9x) completely dominate
    const onlineBoost = 1.5;
    
    // Process each online source using shared helper
    onlineResults.push(
      ...processOnlineSource(onlineSearches[0], 'SAP Help', 'sap_help', RRF_WEIGHTS.sap_help, onlineBoost),
      ...processOnlineSource(onlineSearches[1], 'SAP Community', 'sap_community', RRF_WEIGHTS.sap_community, onlineBoost * 0.5),
      ...processOnlineSource(onlineSearches[2], 'Software-Heroes', 'software_heroes', RRF_WEIGHTS.software_heroes, onlineBoost * 0.9)
    );
    
    console.log(`🌐 [ONLINE] Total: ${onlineResults.length} online results`);
  }
  
  // Merge offline and online results
  const allResults = [...offlineResults, ...onlineResults];
  
  // Sort by final score (higher = better)
  allResults.sort((a, b) => b.finalScore - a.finalScore);
  
  // Deduplicate using source-aware keys (URL canonicalization for online)
  // This properly handles SAP Help duplicates that differ only by version/locale params
  const deduped = new Map<string, SearchResult>();
  for (const result of allResults) {
    const key = dedupeKey(result);
    if (!deduped.has(key) || deduped.get(key)!.finalScore < result.finalScore) {
      deduped.set(key, result);
    }
  }
  
  // Second pass: deduplicate release notes with identical content (ABENNEWS-*)
  // These often have different IDs but identical snippets across versions
  const contentDeduped = new Map<string, SearchResult>();
  const releaseNoteTexts = new Map<string, string>(); // Track seen release note content
  
  for (const result of deduped.values()) {
    // Check if this is a release note entry
    if (result.id && result.id.includes('ABENNEWS-')) {
      // Use the text content (excluding the ID part) as the dedupe key
      const textWithoutId = result.text.replace(/ABENNEWS-\d+/g, 'ABENNEWS-XXX').trim();
      const contentKey = `release-note:${textWithoutId.substring(0, 200)}`; // First 200 chars
      
      if (releaseNoteTexts.has(contentKey)) {
        // Skip duplicate release note content, keep the one with higher score
        const existingKey = releaseNoteTexts.get(contentKey)!;
        if (contentDeduped.get(existingKey)!.finalScore < result.finalScore) {
          contentDeduped.delete(existingKey);
          contentDeduped.set(result.id, result);
          releaseNoteTexts.set(contentKey, result.id);
        }
        continue;
      }
      releaseNoteTexts.set(contentKey, result.id);
    }
    contentDeduped.set(result.id, result);
  }
  
  console.log(`Deduplication: ${allResults.length} -> ${deduped.size} -> ${contentDeduped.size} unique results (incl. release notes)`);
  
  // Return top k results
  return Array.from(contentDeduped.values())
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, k);
}
