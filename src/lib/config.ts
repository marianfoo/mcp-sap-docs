// Central configuration for search system
export const CONFIG = {
  // Default number of results to return
  RETURN_K: Number(process.env.RETURN_K || 25),
  
  // Database paths
  DB_PATH: "dist/data/docs.sqlite",
  METADATA_PATH: "src/metadata.json",
  
  // Search behavior
  USE_OR_LOGIC: true, // Use OR logic for better recall in BM25-only mode
  
  // Excerpt lengths for different search types
  EXCERPT_LENGTH_MAIN: 200,    // Main search results excerpt length
  EXCERPT_LENGTH_COMMUNITY: 400, // Community search results excerpt length
};
