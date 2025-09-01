// Simple BM25-only search using FTS5 with metadata-driven configuration
import { searchFTS } from "./searchDb.js";
import { CONFIG } from "./config.js";
import { loadMetadata, getSourceBoosts, expandQueryTerms, getAllLibraryMappings } from "./metadata.js";

export type SearchResult = {
  id: string;
  text: string;
  bm25: number;
  sourceId: string;
  path: string;
  finalScore: number;
};

// Helper to extract source ID from library_id or document path using metadata
function extractSourceId(libraryIdOrPath: string): string {
  if (libraryIdOrPath.startsWith('/')) {
    const parts = libraryIdOrPath.split('/');
    if (parts.length > 1) {
      const sourceId = parts[1];
      // Use metadata-driven library mappings
      const mappings = getAllLibraryMappings();
      return mappings[sourceId] || sourceId;
    }
  }
  return libraryIdOrPath;
}

export async function search(
  query: string,
  { k = CONFIG.RETURN_K } = {}
): Promise<SearchResult[]> {
  // Load metadata for boosts and query expansion
  loadMetadata();
  const sourceBoosts = getSourceBoosts();
  
  // Expand query with synonyms and acronyms
  const queryVariants = expandQueryTerms(query);
  const seen = new Map<string, any>();
  
  // Check if query contains specific ABAP version
  const versionMatch = query.match(/\b(7\.\d{2}|latest)\b/i);
  const requestedVersion = versionMatch ? versionMatch[1].toLowerCase() : null;
  const requestedVersionId = requestedVersion ? requestedVersion.replace('.', '') : null;
  
  // Search with all query variants (union approach)
  for (const variant of queryVariants) {
    try {
      const rows = searchFTS(variant, {}, k);
      for (const r of rows) {
        if (!seen.has(r.id)) {
          seen.set(r.id, r);
        }
      }
    } catch (error) {
      console.warn(`FTS query failed for variant "${variant}":`, error);
      continue;
    }
    if (seen.size >= k) break; // enough candidates
  }
  
  let rows = Array.from(seen.values()).slice(0, k);
  
  // Smart ABAP version filtering - only show latest unless version specified
  if (!requestedVersion) {
    // For general ABAP queries without version, aggressively filter out older versions
    rows = rows.filter(r => {
      const id = r.id || '';
      
      // Keep all non-ABAP-docs sources
      if (!id.includes('/abap-docs-')) return true;
      
      // For ABAP docs, ONLY keep latest version for general queries
      return id.includes('/abap-docs-latest/');
    });
    
    console.log(`Filtered to latest ABAP version only: ${rows.length} results`);
  } else {
    // For version-specific queries, ONLY show the requested version and non-ABAP sources
    rows = rows.filter(r => {
      const id = r.id || '';
      
      // Keep all non-ABAP-docs sources (style guides, cheat sheets, etc.)
      if (!id.includes('/abap-docs-')) return true;
      
      // For ABAP docs, ONLY keep the specifically requested version
      return id.includes(`/abap-docs-${requestedVersionId}/`);
    });
    
    console.log(`Filtered to ABAP version ${requestedVersion} only: ${rows.length} results`);
  }
  
  // Convert to consistent format with source boosts
  const results = rows.map(r => {
    const sourceId = extractSourceId(r.libraryId || r.id);
    let boost = sourceBoosts[sourceId] || 0;
    
    // Additional boost for version-specific queries
    if (requestedVersionId && r.id.includes(`/abap-docs-${requestedVersionId}/`)) {
      boost += 1.0; // Extra boost for requested version
    }
    
    return {
      id: r.id,
      text: `${r.title || ""}\n\n${r.description || ""}\n\n${r.id}`,
      bm25: r.bm25Score,
      sourceId,
      path: r.id,
      finalScore: (-r.bm25Score) * (1 + boost) // Convert to descending with boost
    };
  });
  
  // Results are already filtered above, just sort them
  
  // Sort by final score (higher = better)
  return results.sort((a, b) => b.finalScore - a.finalScore);
}
