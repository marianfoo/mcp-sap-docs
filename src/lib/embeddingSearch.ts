// Semantic (embedding-based) search using Xenova/all-MiniLM-L6-v2.
// Pre-computed embeddings are stored in the `embeddings` table in docs.sqlite.
// This module provides:
//   - loadEmbeddingModel()  — pre-warm the model at server startup
//   - buildSemanticResults() — called from search.ts per-query
import { pipeline, env } from "@huggingface/transformers";
import type { SearchResult } from "./search.js";
import { CONFIG } from "./config.js";
import { openDb } from "./searchDb.js";

// Singleton pipeline — loaded once, reused for every query
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: ((input: string, options?: Record<string, unknown>) => Promise<any>) | null = null;
let modelLoadPromise: Promise<void> | null = null;

/**
 * Pre-warm the embedding model.
 * Safe to call multiple times — subsequent calls return the same promise.
 * Non-blocking at call site (caller should not await unless needed).
 */
export async function loadEmbeddingModel(cacheDir?: string): Promise<void> {
  if (extractor) return; // already loaded
  if (modelLoadPromise) return modelLoadPromise; // already loading

  const dir = cacheDir ?? CONFIG.MODELS_DIR;
  env.cacheDir = dir;

  modelLoadPromise = (async () => {
    console.log(`🤖 Pre-loading embedding model (cache: ${dir})...`);
    const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      cache_dir: dir,
      dtype: "fp32",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractor = pipe as unknown as ((input: string, options?: Record<string, unknown>) => Promise<any>);
    console.log(`✅ Embedding model ready.`);
  })();

  return modelLoadPromise;
}

/**
 * Embed a single query string. Returns L2-normalized Float32Array (384-dim).
 * Ensures model is loaded first (blocks if still loading).
 */
async function embedQuery(text: string): Promise<Float32Array> {
  if (!extractor) {
    await loadEmbeddingModel();
  }
  const output = await extractor!(text, { pooling: "mean", normalize: false });
  // output.data is Float32Array for feature-extraction pipelines
  const vec = new Float32Array(output.data as ArrayLike<number>);
  return l2Normalize(vec);
}

/**
 * L2-normalize a Float32Array in-place.
 * After normalization cosine_similarity(a, b) == dot(a, b).
 */
function l2Normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

/**
 * Cosine similarity for two L2-normalized vectors (= dot product).
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Check whether the embeddings table exists in the database.
 */
function embeddingsTableExists(): boolean {
  try {
    const db = openDb();
    const row = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'`
    ).get() as { name: string } | undefined;
    return !!row;
  } catch {
    return false;
  }
}

const SEMANTIC_RRF_K = 60;

function rrf(rank: number): number {
  return 1 / (SEMANTIC_RRF_K + rank);
}

/**
 * Build semantic search results by re-ranking BM25 candidates with cosine similarity.
 *
 * Strategy:
 *  1. Fetch stored embeddings for the BM25 candidate IDs.
 *  2. Embed the query.
 *  3. Rank candidates by cosine similarity.
 *  4. Return as SearchResult[] with sourceKind='semantic' so they slot into RRF fusion.
 *
 * Returns [] gracefully when:
 *  - Embeddings table absent (before first build:embeddings run)
 *  - Model not available
 *  - No candidates have stored embeddings
 */
export async function buildSemanticResults(
  query: string,
  bm25Results: SearchResult[],
  k: number
): Promise<SearchResult[]> {
  if (!embeddingsTableExists()) {
    return [];
  }

  if (bm25Results.length === 0) return [];

  const db = openDb();

  // Fetch stored embeddings for BM25 candidates
  const ids = bm25Results.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT doc_id, vec FROM embeddings WHERE doc_id IN (${placeholders})`)
    .all(...ids) as { doc_id: string; vec: Buffer }[];

  if (rows.length === 0) return [];

  // Embed query (ensures model is loaded)
  let queryVec: Float32Array;
  try {
    queryVec = await embedQuery(query);
  } catch (err) {
    console.warn("⚠️  Embedding query failed:", (err as Error).message);
    return [];
  }

  // Score each candidate
  const scored: { result: SearchResult; score: number }[] = [];
  const docMap = new Map(bm25Results.map((r) => [r.id, r]));

  for (const row of rows) {
    const docVec = new Float32Array(
      row.vec.buffer,
      row.vec.byteOffset,
      row.vec.byteLength / 4
    );
    const score = cosineSimilarity(queryVec, docVec);
    const original = docMap.get(row.doc_id);
    if (original) {
      scored.push({ result: original, score });
    }
  }

  // Sort by cosine similarity (descending)
  scored.sort((a, b) => b.score - a.score);

  // Build SearchResult[] with semantic sourceKind and RRF scoring
  const semanticWeight = CONFIG.EMBEDDING_WEIGHT;
  return scored.slice(0, k).map(({ result, score }, idx) => ({
    ...result,
    sourceKind: "semantic" as const,
    finalScore: rrf(idx + 1) * semanticWeight,
    bm25: 0,
    debug: {
      ...result.debug,
      rrfScore: rrf(idx + 1) * semanticWeight,
      boost: score, // cosine similarity as debug info
    },
  }));
}
