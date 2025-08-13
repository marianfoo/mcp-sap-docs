import Database from "better-sqlite3";
import path from "path";
import { existsSync, statSync } from "fs";

let db: Database.Database | null = null;

export function openDb(dbPath?: string): Database.Database {
  if (!db) {
    // Default path relative to project root
    const defaultPath = path.join(process.cwd(), "dist", "data", "docs.sqlite");
    const finalPath = dbPath || defaultPath;
    
    if (!existsSync(finalPath)) {
      throw new Error(`FTS database not found at ${finalPath}. Run 'npm run build:fts' to create it.`);
    }
    
    db = new Database(finalPath, { readonly: true, fileMustExist: true });
    // Read-only safe pragmas
    db.pragma("query_only = ON");
    db.pragma("cache_size = -8000"); // ~8MB page cache
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

type Filters = {
  libraries?: string[];   // e.g. ["/cap", "/sapui5"]
  types?: string[];       // e.g. ["markdown","jsdoc","sample"]
};

export type FTSResult = {
  id: string;
  libraryId: string;
  type: string;
  title: string;
  description: string;
  relFile: string;
  snippetCount: number;
  bm25Score: number;
  highlight: string;
};

function toMatchQuery(userQuery: string): string {
  // Convert user input into FTS syntax with prefix matching:
  // keep quoted phrases as-is, append * to bare terms for prefix matching
  const terms = userQuery.match(/"[^"]+"|\S+/g) ?? [];
  // Very common stopwords that hurt FTS when ANDed together
  const stopwords = new Set([
    "a","an","the","to","in","on","for","and","or","of","with","from",
    "how","what","why","when","where","which","who","whom","does","do","is","are"
  ]);
  return terms.map(t => {
    if (t.startsWith('"') && t.endsWith('"')) return t; // phrase query
    
    // For terms with dots (like sap.m.Button), quote them as phrases
    if (t.includes('.')) {
      return `"${t}"`;
    }
    
    // Sanitize and add prefix matching for simple terms
    const clean = t.replace(/[^\w]/g, "").toLowerCase();
    if (!clean || stopwords.has(clean)) return "";
    return `${clean}*`;
  }).filter(Boolean).join(" ");
}

/**
 * Fast FTS5 candidate filtering
 * Returns document IDs that match the query, for use with existing sophisticated scoring
 */
export function getFTSCandidateIds(userQuery: string, filters: Filters = {}, limit = 100): string[] {
  const database = openDb();
  const match = toMatchQuery(userQuery);
  
  if (!match.trim()) {
    return []; // Empty query
  }

  // Build WHERE conditions
  const conditions = ["docs MATCH ?"];
  const params: any[] = [match];

  if (filters.libraries?.length) {
    const placeholders = filters.libraries.map(() => "?").join(",");
    conditions.push(`libraryId IN (${placeholders})`);
    params.push(...filters.libraries);
  }

  if (filters.types?.length) {
    const placeholders = filters.types.map(() => "?").join(",");
    conditions.push(`type IN (${placeholders})`);
    params.push(...filters.types);
  }

  const sql = `
    SELECT id
    FROM docs
    WHERE ${conditions.join(" AND ")}
    ORDER BY bm25(docs)
    LIMIT ?
  `;

  try {
    const stmt = database.prepare(sql);
    const rows = stmt.all(...params, limit) as { id: string }[];
    return rows.map(r => r.id);
  } catch (error) {
    console.warn("FTS query failed, falling back to full search:", error);
    return []; // Fallback gracefully
  }
}

/**
 * Full FTS search with results (for debugging/testing)
 */
export function searchFTS(userQuery: string, filters: Filters = {}, limit = 20): FTSResult[] {
  const database = openDb();
  const match = toMatchQuery(userQuery);
  
  if (!match.trim()) {
    return [];
  }

  // Build WHERE conditions
  const conditions = ["docs MATCH ?"];
  const params: any[] = [match];

  if (filters.libraries?.length) {
    const placeholders = filters.libraries.map(() => "?").join(",");
    conditions.push(`libraryId IN (${placeholders})`);
    params.push(...filters.libraries);
  }

  if (filters.types?.length) {
    const placeholders = filters.types.map(() => "?").join(",");
    conditions.push(`type IN (${placeholders})`);
    params.push(...filters.types);
  }

  // BM25 weights: title, description, keywords, controlName, namespace
  // Higher weight = more important (title and controlName are most important)
  const sql = `
    SELECT
      id, libraryId, type, title, description, relFile, snippetCount,
      highlight(docs, 2, '<mark>', '</mark>') AS highlight,
      bm25(docs, 1.0, 8.0, 2.0, 4.0, 6.0, 3.0) AS bm25Score
    FROM docs
    WHERE ${conditions.join(" AND ")}
    ORDER BY bm25Score
    LIMIT ?
  `;

  try {
    const stmt = database.prepare(sql);
    const rows = stmt.all(...params, limit) as any[];

    return rows.map(r => ({
      id: r.id,
      libraryId: r.libraryId,
      type: r.type,
      title: r.title,
      description: r.description,
      relFile: r.relFile,
      snippetCount: r.snippetCount,
      bm25Score: Number(r.bm25Score),
      highlight: r.highlight || r.title
    }));
  } catch (error) {
    console.warn("FTS query failed:", error);
    return [];
  }
}

/**
 * Get database stats for monitoring
 */
export function getFTSStats(): { rowCount: number; dbSize: number; mtime: string } | null {
  try {
    const database = openDb();
    const rowCount = database.prepare("SELECT count(*) as n FROM docs").get() as { n: number };
    
    const dbPath = path.join(process.cwd(), "data", "docs.sqlite");
    const stats = statSync(dbPath);
    
    return {
      rowCount: rowCount.n,
      dbSize: stats.size,
      mtime: stats.mtime.toISOString()
    };
  } catch (error) {
    console.warn("Could not get FTS stats:", error);
    return null;
  }
}