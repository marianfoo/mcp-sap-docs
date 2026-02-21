import { getVariantConfig } from "./variant.js";

const variant = getVariantConfig();

// Central configuration for search system
export const CONFIG = {
  // Default number of results to return (50 is optimal for comprehensive coverage)
  RETURN_K: Number(process.env.RETURN_K || 50),
  
  // Database paths
  DB_PATH: "dist/data/docs.sqlite",
  METADATA_PATH: process.env.METADATA_PATH || variant.metadataPath || "src/metadata.json",
  
  // Search behavior
  USE_OR_LOGIC: true, // Use OR logic for better recall in BM25-only mode
  
  // Excerpt lengths for different search types
  EXCERPT_LENGTH_MAIN: 400,    // Main search results excerpt length
  EXCERPT_LENGTH_COMMUNITY: 600, // Community search results excerpt length
  
  // Maximum content length for SAP Help and Community full content retrieval
  // Limits help prevent token overflow and keep responses manageable (~18,750 tokens)
  MAX_CONTENT_LENGTH: 75000,  // 75,000 characters

  // ---------------------------------------------------------------------------
  // Software Heroes API Configuration
  // ---------------------------------------------------------------------------
  
  // Client identifier sent in headers (User-Agent and X-Client)
  SOFTWARE_HEROES_CLIENT: process.env.SOFTWARE_HEROES_CLIENT || "ABAPMCPSERVER",
  
  // Request timeout in milliseconds (default: 10 seconds)
  SOFTWARE_HEROES_TIMEOUT_MS: Number(process.env.SOFTWARE_HEROES_TIMEOUT_MS || 10000),
  
  // Cache TTL in milliseconds (default: 24 hours = 86400000ms)
  // Cache is in-server (process-local) and resets on restart/deploy
  SOFTWARE_HEROES_CACHE_TTL_MS: Number(process.env.SOFTWARE_HEROES_CACHE_TTL_MS || 86400000),

  // Disk cache path for the ABAP Feature Matrix (survives server restarts)
  SOFTWARE_HEROES_AFM_CACHE_PATH: process.env.SOFTWARE_HEROES_AFM_CACHE_PATH || "dist/data/abap-feature-matrix.json",
};
