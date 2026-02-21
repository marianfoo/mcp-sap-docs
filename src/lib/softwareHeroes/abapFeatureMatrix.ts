// ABAP Feature Matrix from Software Heroes
// Fetch, parse, and search the ABAP Feature Matrix HTML content
// Always fetches full English content and caches it locally (memory + disk)
// No external HTML parsing dependencies - uses regex-based best-effort parsing

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { callSoftwareHeroesApi, TtlCache, decodeEntities, stripTags } from "./core.js";
import { CONFIG } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status markers used in the matrix */
export type FeatureStatus = "available" | "unavailable" | "deprecated" | "needs_review" | "downport" | "unknown";

/** A single feature row in a table */
export interface FeatureRow {
  /** Feature name/label */
  feature: string;
  /** Link to more info (if available) */
  link?: string;
  /** Raw cell values (including release columns) */
  cells: string[];
  /** Status by release version (derived from emoji markers) */
  statusByRelease: Record<string, FeatureStatus>;
}

/** A table section in the matrix */
export interface FeatureTable {
  /** Section title (e.g., "ABAP SQL", "Core Data Services") */
  sectionTitle: string;
  /** Column headers (typically release versions) */
  headers: string[];
  /** Feature rows */
  rows: FeatureRow[];
}

/** Parsed ABAP Feature Matrix */
export interface ParsedFeatureMatrix {
  /** Legend explaining the status markers */
  legend: Record<string, string>;
  /** Navigation anchors/sections */
  sections: string[];
  /** Feature tables */
  tables: FeatureTable[];
}

/** Search match result */
export interface FeatureMatch {
  /** Feature name */
  feature: string;
  /** Section/table the feature belongs to */
  section: string;
  /** Link to more info */
  link?: string;
  /** Status by release version */
  statusByRelease: Record<string, FeatureStatus>;
  /** Match score (higher = better match) */
  score: number;
}

// ---------------------------------------------------------------------------
// Cache for parsed matrix (24h TTL)
// ---------------------------------------------------------------------------

const matrixCache = new TtlCache<ParsedFeatureMatrix>(24 * 60 * 60 * 1000);
const CACHE_KEY = "abap-feature-matrix-en";

// ---------------------------------------------------------------------------
// Disk Cache (survives server restarts, no TTL – last-resort fallback)
// ---------------------------------------------------------------------------

/** Write parsed matrix to disk as JSON */
export async function writeDiskCache(
  matrix: ParsedFeatureMatrix,
  cachePath = CONFIG.SOFTWARE_HEROES_AFM_CACHE_PATH
): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(matrix), "utf-8");
}

/** Read previously-persisted matrix from disk (returns undefined on any error) */
export async function readDiskCache(
  cachePath = CONFIG.SOFTWARE_HEROES_AFM_CACHE_PATH
): Promise<ParsedFeatureMatrix | undefined> {
  try {
    const raw = await readFile(cachePath, "utf-8");
    return JSON.parse(raw) as ParsedFeatureMatrix;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// HTML Parsing Utilities (decodeEntities & stripTags imported from core.ts)
// ---------------------------------------------------------------------------

/** Extract href from an anchor tag */
const extractHref = (html: string): string | undefined => {
  const match = html.match(/href="([^"]+)"/i);
  return match ? decodeEntities(match[1]) : undefined;
};

/** Map emoji/text markers to status */
const parseStatus = (cellText: string): FeatureStatus => {
  const text = cellText.trim();
  if (text.includes("✅") || text.toLowerCase() === "available") return "available";
  if (text.includes("❌") || text.toLowerCase() === "not available") return "unavailable";
  if (text.includes("⭕") || text.toLowerCase() === "deprecated") return "deprecated";
  if (text.includes("❔") || text.toLowerCase() === "needs review") return "needs_review";
  if (text.includes("🔽") || text.toLowerCase() === "downport") return "downport";
  return "unknown";
};

// ---------------------------------------------------------------------------
// API Fetch (always full English content)
// ---------------------------------------------------------------------------

/**
 * Fetch the ABAP Feature Matrix HTML content from Software Heroes API
 * Always fetches full content in English
 */
async function fetchAbapFeatureMatrixHtml(): Promise<string> {
  // Always fetch full matrix in English
  const dataParams: Record<string, string> = {
    id_user: "",
    id_pass: "",
    id_stay: "X",
    zid_build_navigation: "X",
    zid_build_order: "",
    zid_matrix_mode: "MODE_AFM",
    id_langu: "en",
    id_page: "abap-feature-matrix",
    id_error: "",
    id_hfld_evt: "",
    id_hfld_obj: "",
    id_api_class_name: "zcl_abap_feature_matrix_viewer",
    zid_release: "LATEST",
    zid_area: "ALL",
  };

  const response = await callSoftwareHeroesApi("CUST_API", dataParams);

  if (!response.status) {
    throw new Error(`Software Heroes API returned error: ${response.msg}`);
  }

  // The HTML content may be in 'content', 'data', or 'screen[0].content'
  // The Feature Matrix API returns it in screen[].content with id="id_matrix_out"
  // Guard against data being a JSON array (returned by START_SEARCH_JSON, not this method)
  const dataStr = typeof response.data === "string" ? response.data : "";
  let html = response.content || dataStr || "";
  
  // Check screen array for content (API response format)
  if (!html && response.screen && response.screen.length > 0) {
    const matrixScreen = response.screen.find(s => s.id === "id_matrix_out");
    if (matrixScreen?.content) {
      html = matrixScreen.content;
    } else if (response.screen[0]?.content) {
      html = response.screen[0].content;
    }
  }
  
  if (!html) {
    throw new Error("No content returned from Software Heroes API");
  }

  return html;
}

// ---------------------------------------------------------------------------
// HTML Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the ABAP Feature Matrix HTML into structured data
 */
export function parseAbapFeatureMatrix(html: string): ParsedFeatureMatrix {
  const result: ParsedFeatureMatrix = {
    legend: {},
    sections: [],
    tables: [],
  };

  // Extract legend items (✅ - Available, etc.)
  const legendMatch = html.match(/<h3>Legende<\/h3>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i) 
    || html.match(/<h3>Legend<\/h3>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);
  if (legendMatch) {
    const legendHtml = legendMatch[1];
    const legendItems = legendHtml.matchAll(/<li>([\s\S]*?)<\/li>/gi);
    for (const item of legendItems) {
      const text = stripTags(item[1]);
      const parts = text.split(/\s*-\s*/);
      if (parts.length >= 2) {
        result.legend[parts[0].trim()] = parts.slice(1).join(" - ").trim();
      }
    }
  }

  // Extract navigation sections
  const navMatch = html.match(/<div[^>]*id="zid_navigation_area"[^>]*>([\s\S]*?)<\/div>/i);
  if (navMatch) {
    const navHtml = navMatch[1];
    const anchors = navHtml.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi);
    for (const anchor of anchors) {
      const sectionName = stripTags(anchor[1]);
      if (sectionName) {
        result.sections.push(sectionName);
      }
    }
  }

  // Extract tables
  const tableMatches = html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi);
  
  let tableIndex = 0;
  for (const tableMatch of tableMatches) {
    const tableHtml = tableMatch[1];
    const table: FeatureTable = {
      sectionTitle: result.sections[tableIndex] || `Section ${tableIndex + 1}`,
      headers: [],
      rows: [],
    };

    // Extract header row
    const headerMatch = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
    if (headerMatch) {
      const headerCells = headerMatch[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi);
      for (const cell of headerCells) {
        const headerText = stripTags(cell[1]);
        if (headerText) {
          table.headers.push(headerText);
        }
      }
    }

    // Extract data rows
    const rowMatches = tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    let rowIndex = 0;
    for (const rowMatch of rowMatches) {
      if (rowIndex === 0) {
        rowIndex++;
        continue;
      }

      const rowHtml = rowMatch[1];
      const cells: string[] = [];
      const cellMatches = rowHtml.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi);
      
      let featureName = "";
      let featureLink: string | undefined;
      let cellIndex = 0;

      for (const cellMatch of cellMatches) {
        const cellHtml = cellMatch[1];
        const cellText = stripTags(cellHtml);
        cells.push(cellText);

        if (cellIndex === 0) {
          featureName = cellText;
          featureLink = extractHref(cellHtml);
        }
        cellIndex++;
      }

      if (!featureName || cells.length === 0) {
        rowIndex++;
        continue;
      }

      const statusByRelease: Record<string, FeatureStatus> = {};
      for (let i = 1; i < cells.length && i < table.headers.length; i++) {
        const releaseHeader = table.headers[i];
        if (releaseHeader) {
          statusByRelease[releaseHeader] = parseStatus(cells[i]);
        }
      }

      table.rows.push({
        feature: featureName,
        link: featureLink,
        cells,
        statusByRelease,
      });

      rowIndex++;
    }

    if (table.rows.length > 0) {
      result.tables.push(table);
      tableIndex++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Get Cached or Fetch Matrix
// ---------------------------------------------------------------------------

/**
 * Get the parsed feature matrix (memory cache -> API -> disk fallback)
 */
async function getFeatureMatrix(): Promise<ParsedFeatureMatrix> {
  // 1. In-memory cache (fast path)
  const cached = matrixCache.get(CACHE_KEY);
  if (cached) {
    console.log("✅ [FeatureMatrix] Using cached matrix");
    return cached;
  }

  // 2. Try live API
  try {
    console.log("🌐 [FeatureMatrix] Fetching from API...");
    const html = await fetchAbapFeatureMatrixHtml();
    const matrix = parseAbapFeatureMatrix(html);

    matrixCache.set(CACHE_KEY, matrix);
    console.log(`✅ [FeatureMatrix] Cached ${countFeatures(matrix)} features across ${matrix.sections.length} sections`);

    // Persist to disk (fire-and-forget)
    writeDiskCache(matrix).catch(err =>
      console.error("⚠️ [FeatureMatrix] Failed to write disk cache:", err)
    );

    return matrix;
  } catch (apiError) {
    console.error("⚠️ [FeatureMatrix] API fetch failed, trying disk fallback:", apiError);
  }

  // 3. Disk fallback
  const diskMatrix = await readDiskCache();
  if (diskMatrix) {
    matrixCache.set(CACHE_KEY, diskMatrix);
    console.log(`📂 [FeatureMatrix] Loaded ${countFeatures(diskMatrix)} features from disk cache`);
    return diskMatrix;
  }

  throw new Error(
    "ABAP Feature Matrix unavailable: API fetch failed and no disk cache exists"
  );
}

/** Count total features in matrix */
function countFeatures(matrix: ParsedFeatureMatrix): number {
  return matrix.tables.reduce((sum, table) => sum + table.rows.length, 0);
}

// ---------------------------------------------------------------------------
// Startup Prefetch
// ---------------------------------------------------------------------------

/**
 * Prefetch the ABAP Feature Matrix at server startup.
 * Tries the live API first; on failure falls back to the disk cache.
 * Never throws – errors are logged so the server always starts.
 */
export async function prefetchFeatureMatrix(): Promise<void> {
  try {
    console.log("🚀 [FeatureMatrix] Prefetching matrix at startup...");
    const html = await fetchAbapFeatureMatrixHtml();
    const matrix = parseAbapFeatureMatrix(html);

    matrixCache.set(CACHE_KEY, matrix);
    await writeDiskCache(matrix);
    console.log(
      `✅ [FeatureMatrix] Prefetched and persisted ${countFeatures(matrix)} features across ${matrix.sections.length} sections`
    );
    return;
  } catch (apiError) {
    console.error("⚠️ [FeatureMatrix] Prefetch API call failed:", apiError);
  }

  // Fallback: load from disk if available
  try {
    const diskMatrix = await readDiskCache();
    if (diskMatrix) {
      matrixCache.set(CACHE_KEY, diskMatrix);
      console.log(
        `📂 [FeatureMatrix] Prefetch loaded ${countFeatures(diskMatrix)} features from disk cache`
      );
    } else {
      console.warn("⚠️ [FeatureMatrix] No disk cache available; matrix will be fetched on first use");
    }
  } catch (diskError) {
    console.error("⚠️ [FeatureMatrix] Disk cache read failed during prefetch:", diskError);
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search the parsed ABAP Feature Matrix for matching features
 * If query is empty, returns all features
 */
export function searchAbapFeatureMatrix(
  matrix: ParsedFeatureMatrix,
  query: string,
  limit?: number
): FeatureMatch[] {
  const matches: FeatureMatch[] = [];
  const queryLower = query.toLowerCase().trim();
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 1);

  for (const table of matrix.tables) {
    for (const row of table.rows) {
      const featureLower = row.feature.toLowerCase();
      const sectionLower = table.sectionTitle.toLowerCase();

      let score = 0;

      // If no query, include all with base score
      if (!queryLower) {
        score = 1;
      } else {
        // Exact match
        if (featureLower === queryLower) {
          score += 100;
        }

        // Term matching
        for (const term of queryTerms) {
          if (featureLower.includes(term)) {
            score += 10;
            if (featureLower.startsWith(term)) {
              score += 5;
            }
          }
          if (sectionLower.includes(term)) {
            score += 3;
          }
        }
      }

      if (score > 0) {
        matches.push({
          feature: row.feature,
          section: table.sectionTitle,
          link: row.link,
          statusByRelease: row.statusByRelease,
          score,
        });
      }
    }
  }

  // Sort by score (descending)
  matches.sort((a, b) => b.score - a.score);
  
  // Apply limit if specified
  return limit ? matches.slice(0, limit) : matches;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SearchFeatureMatrixOptions {
  /** Search query (optional - empty returns all features) */
  query?: string;
  /** Maximum number of results (optional - no limit by default) */
  limit?: number;
}

export interface SearchFeatureMatrixResult {
  /** Matching features */
  matches: FeatureMatch[];
  /** Metadata about the matrix */
  meta: {
    /** Total features in matrix */
    totalFeatures: number;
    /** Total sections in matrix */
    totalSections: number;
    /** Available sections */
    sections: string[];
  };
  /** Source URL for attribution */
  sourceUrl: string;
  /** Legend explaining status markers */
  legend: Record<string, string>;
}

/**
 * Search the ABAP Feature Matrix
 * Fetches full English content from API (cached for 24h) and filters locally
 * 
 * @param options.query - Search query (optional, empty returns all)
 * @param options.limit - Max results (optional, no limit by default)
 */
export async function searchFeatureMatrix(
  options: SearchFeatureMatrixOptions = {}
): Promise<SearchFeatureMatrixResult> {
  const { query = "", limit } = options;

  // Get matrix (from cache or API)
  const matrix = await getFeatureMatrix();

  // Search/filter locally
  const matches = searchAbapFeatureMatrix(matrix, query, limit);

  return {
    matches,
    meta: {
      totalFeatures: countFeatures(matrix),
      totalSections: matrix.sections.length,
      sections: matrix.sections,
    },
    sourceUrl: "https://software-heroes.com/en/abap-feature-matrix",
    legend: matrix.legend,
  };
}

// ---------------------------------------------------------------------------
// Cache Stats (for debugging)
// ---------------------------------------------------------------------------

export function getFeatureMatrixCacheStats() {
  return {
    size: matrixCache.get(CACHE_KEY) ? 1 : 0,
    ttlHours: 24,
    cached: matrixCache.get(CACHE_KEY) !== undefined,
  };
}
