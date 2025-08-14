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
  
  const rows = Array.from(seen.values()).slice(0, k);
  
  // Convert to consistent format with source boosts
  const results = rows.map(r => {
    const sourceId = extractSourceId(r.libraryId || r.id);
    const boost = sourceBoosts[sourceId] || 0;
    
    return {
      id: r.id,
      text: `${r.title || ""}\n\n${r.description || ""}\n\n${r.id}`,
      bm25: r.bm25Score,
      sourceId,
      path: r.id,
      finalScore: (-r.bm25Score) * (1 + boost) // Convert to descending with boost
    };
  });
  
  // Sort by final score (higher = better)
  return results.sort((a, b) => b.finalScore - a.finalScore);
}
