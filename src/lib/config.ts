// Central configuration for search system
export const CONFIG = {
  // Default number of results to return
  RETURN_K: Number(process.env.RETURN_K || 25),
  
  // Database paths
  DB_PATH: "dist/data/docs.sqlite",
  METADATA_PATH: "src/metadata.json",
  
  // Search behavior
  USE_OR_LOGIC: true, // Use OR logic for better recall in BM25-only mode
};
