// Simple BM25-only search using FTS5 with metadata-driven configuration
import { searchFTS } from "./searchDb.js";
import { CONFIG } from "./config.js";
import { loadMetadata, getSourceBoosts, expandQueryTerms } from "./metadata.js";

export type SearchResult = {
  id: string;
  text: string;
  bm25: number;
  sourceId: string;
  path: string;
  relFile: string;
  finalScore: number;
};

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
  
  // Check if query requests specific ABAP library type (cloud vs standard)
  // "cloud", "btp", "abap cloud", "cloud abap" → cloud
  // "standard", "on-premise", "onpremise", "on premise" → standard (explicit)
  // No specification → standard (default)
  const cloudMatch = query.match(/\b(cloud|btp|steampunk)\b/i);
  const standardMatch = query.match(/\b(standard|on-?premise|onpremise)\b/i);
  
  // Determine which ABAP library to use: 'cloud', 'standard', or null (show standard by default)
  const requestedAbapLibrary = cloudMatch ? 'cloud' : (standardMatch ? 'standard' : null);
  
  // Check if query explicitly mentions ABAP (for extra boosting of official docs)
  const isExplicitAbapQuery = query.match(/\babap\b/i) !== null;
  
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
  
  // Smart ABAP library filtering - show standard by default, cloud if explicitly requested
  if (requestedAbapLibrary === 'cloud') {
    // For cloud-specific queries, show cloud ABAP docs
    rows = rows.filter(r => {
      const id = r.id || '';
      
      // Keep all non-ABAP-docs sources (style guides, cheat sheets, etc.)
      if (!id.includes('/abap-docs-')) return true;
      
      // For ABAP docs, ONLY keep cloud library
      return id.includes('/abap-docs-cloud/');
    });
    
    console.log(`Filtered to ABAP Cloud: ${rows.length} results`);
  } else {
    // For general ABAP queries or explicit standard requests, show standard (on-premise) ABAP docs
    rows = rows.filter(r => {
      const id = r.id || '';
      
      // Keep all non-ABAP-docs sources (style guides, cheat sheets, etc.)
      if (!id.includes('/abap-docs-')) return true;
      
      // For ABAP docs, ONLY keep standard library (default for on-premise)
      return id.includes('/abap-docs-standard/');
    });
    
    console.log(`Filtered to Standard ABAP (on-premise): ${rows.length} results`);
  }
  
  // Convert to consistent format with source boosts
  const results = rows.map(r => {
    const sourceId = extractSourceId(r.libraryId || r.id);
    let boost = sourceBoosts[sourceId] || 0;
    
    // Extra boost for official ABAP docs when "abap" is explicitly in the query
    // This prioritizes official documentation over community guides and style guides
    if (isExplicitAbapQuery && r.id.includes('/abap-docs-')) {
      boost += 2.0; // Strong boost for official ABAP keyword documentation
    }
    
    // Additional boost for library-specific queries
    if (requestedAbapLibrary === 'cloud' && r.id.includes('/abap-docs-cloud/')) {
      boost += 1.0; // Extra boost for cloud when explicitly requested
    } else if (requestedAbapLibrary === 'standard' && r.id.includes('/abap-docs-standard/')) {
      boost += 0.5; // Slight boost for explicit standard request
    }
    
    return {
      id: r.id,
      text: `${r.title || ""}\n\n${r.description || ""}\n\n${r.id}`,
      bm25: r.bm25Score,
      sourceId,
      path: r.id,
      relFile: r.relFile || '',
      finalScore: (-r.bm25Score) * (1 + boost) // Convert to descending with boost
    };
  });
  
  // Results are already filtered above, just sort them
  
  // Sort by final score (higher = better)
  return results.sort((a, b) => b.finalScore - a.finalScore);
}
