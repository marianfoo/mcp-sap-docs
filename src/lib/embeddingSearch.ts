// Semantic (embedding-based) search using Xenova/all-MiniLM-L6-v2.
// Pre-computed embeddings are stored in the `embeddings` table in docs.sqlite.
// This module provides:
//   - loadEmbeddingModel()  — pre-warm the model at server startup
//   - buildSemanticResults() — called from search.ts per-query
import { extractSourceId, type SearchResult } from "./search.js";
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

  modelLoadPromise = (async () => {
    console.log(`🤖 Pre-loading embedding model ${CONFIG.EMBEDDING_MODEL_ID} (cache: ${dir})...`);
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = dir;
    const pipe = await pipeline("feature-extraction", CONFIG.EMBEDDING_MODEL_ID, {
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
export async function embedQuery(text: string): Promise<Float32Array> {
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

// ---------------------------------------------------------------------------
// Nearest-class-mean news intent classifier (Prototypical Networks, Snell 2017)
// ---------------------------------------------------------------------------
// Two prototype sets define "news intent" and "general intent" in embedding
// space. At startup we embed each sentence and average the vectors into two
// centroids. At query time we compare the query vector to both centroids via
// cosine similarity and classify by the nearer one. No threshold tuning, no
// model dependency — relative ranking is model-agnostic.
// ---------------------------------------------------------------------------

const NEWS_PROTOTYPES = [
  "what's new in this release",
  "changes between version X and version Y",
  "what changed since the last update",
  "release notes and changelog",
  "what was added or removed in this version",
  "differences between releases",
  "new features and deprecations since upgrade",
  "what changed in S4HANA between two releases",
  "upgrade notes for the new version",
];

const NON_NEWS_PROTOTYPES = [
  "how do I implement a method in ABAP",
  "what is the syntax for a SELECT statement",
  "how to define a CDS view entity",
  "best practice for naming variables in ABAP",
  "how to handle exceptions in a class",
  "unit testing an ABAP method",
  "explain the difference between classes and reports",
  "how does RAP managed scenario work",
  "configure Fiori launchpad tiles",
];

let _newsCentroid: Float32Array | null = null;
let _nonNewsCentroid: Float32Array | null = null;
let _centroidInitPromise: Promise<void> | null = null;

async function computeCentroid(sentences: string[]): Promise<Float32Array> {
  const vecs = await Promise.all(sentences.map(s => embedQuery(s)));
  const dim = vecs[0].length;
  const sum = new Float32Array(dim);
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) sum[i] += v[i];
  }
  return l2Normalize(sum); // normalize after summing for valid cosine comparison
}

async function ensureCentroids(): Promise<void> {
  if (_newsCentroid && _nonNewsCentroid) return;
  if (_centroidInitPromise) { await _centroidInitPromise; return; }
  _centroidInitPromise = (async () => {
    [_newsCentroid, _nonNewsCentroid] = await Promise.all([
      computeCentroid(NEWS_PROTOTYPES),
      computeCentroid(NON_NEWS_PROTOTYPES),
    ]);
    console.log("🎯 [NEWS-INTENT] Centroid classifier initialized.");
  })();
  await _centroidInitPromise;
}

/**
 * Nearest-class-mean news intent detection.
 * Pass the already-computed query vector (from the semantic recall leg) so
 * there is no second embedding round-trip. Returns true when the query is
 * closer to the "what's new" prototype centroid than to the general-intent one.
 */
export async function detectNewsIntent(queryVector: Float32Array): Promise<boolean> {
  await ensureCentroids();
  const newsScore = cosineSimilarity(queryVector, _newsCentroid!);
  const nonNewsScore = cosineSimilarity(queryVector, _nonNewsCentroid!);
  return newsScore > nonNewsScore;
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

// ---------------------------------------------------------------------------
// Full-corpus semantic recall (roadmap item 7b — the dense leg of hybrid search)
// ---------------------------------------------------------------------------
// The earlier implementation only re-ranked BM25 candidates, so it could never
// surface a document BM25 had not already returned. That left vocabulary-gap
// queries ("reduce the size of a byte string" → CL_ABAP_GZIP) unanswerable:
// there was nothing for the re-ranker to promote. buildSemanticRecall instead
// runs an INDEPENDENT cosine scan over the ENTIRE embedding corpus and fuses the
// winners via RRF alongside the BM25 leg — the canonical dense+sparse hybrid.
// At ~19k vectors a brute-force scan is ~11ms/query (measured) and needs no ANN
// index. BM25 keeps the higher RRF weight, so lexical precision is preserved.

// Cached corpus matrix: N vectors packed contiguously as a single [N * DIM]
// Float32Array, with a parallel doc_id[] (matrix row i ↔ corpusIds[i]). Loaded
// once on first query (~28MB / ~370ms) and reused for every subsequent query.
let corpusMatrix: Float32Array | null = null;
let corpusIds: string[] | null = null;
let corpusDim = 0;

/**
 * Lazily load and cache the full embedding corpus into a packed Float32Array.
 * Returns false (and leaves the cache empty) when embeddings are unavailable.
 */
function loadCorpusEmbeddings(): boolean {
  if (corpusMatrix && corpusIds) return true;
  if (!embeddingsTableExists()) return false;

  const db = openDb();
  const rows = db
    .prepare(`SELECT doc_id, vec FROM embeddings`)
    .all() as { doc_id: string; vec: Buffer }[];

  if (rows.length === 0) return false;

  const dim = rows[0].vec.byteLength / 4;
  const matrix = new Float32Array(rows.length * dim);
  const ids = new Array<string>(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const b = rows[i].vec;
    matrix.set(new Float32Array(b.buffer, b.byteOffset, dim), i * dim);
    ids[i] = rows[i].doc_id;
  }

  corpusMatrix = matrix;
  corpusIds = ids;
  corpusDim = dim;
  console.log(`🧠 [SEMANTIC] Loaded full-corpus embeddings: ${rows.length} vectors × ${dim} dim`);
  return true;
}

type DocMetaRow = {
  id: string;
  libraryId: string;
  title: string;
  description: string;
  relFile: string;
};

/**
 * Fetch display/metadata fields for a small set of doc_ids (the top-k winners),
 * so full-corpus semantic hits can be rendered as full SearchResults even when
 * BM25 never returned them.
 */
function fetchDocMeta(ids: string[]): Map<string, DocMetaRow> {
  const map = new Map<string, DocMetaRow>();
  if (ids.length === 0) return map;

  const db = openDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, libraryId, title, description, relFile FROM docs WHERE id IN (${placeholders})`
    )
    .all(...ids) as DocMetaRow[];

  for (const r of rows) map.set(r.id, r);
  return map;
}

/**
 * Build semantic search results by an independent cosine scan over the full
 * embedding corpus (NOT just BM25 candidates). Returns SearchResult[] with
 * sourceKind='semantic' so they slot into RRF fusion in search.ts; dedupeKey
 * maps semantic hits onto the same key as offline hits, so a document found by
 * both legs fuses (and the higher score wins) while documents found ONLY by the
 * dense leg appear as fresh recall.
 *
 * Returns [] gracefully when:
 *  - EMBEDDING_WEIGHT disabled
 *  - Embeddings table absent (before first build:embeddings run)
 *  - Model not available / query embedding fails
 */
export async function buildSemanticRecall(
  query: string,
  k: number,
  precomputedVec?: Float32Array,
  documentFilter?: (id: string) => boolean
): Promise<SearchResult[]> {
  if (CONFIG.EMBEDDING_WEIGHT <= 0) return [];
  if (!loadCorpusEmbeddings()) return [];

  let queryVec: Float32Array;
  if (precomputedVec) {
    queryVec = precomputedVec;
  } else {
    try {
      queryVec = await embedQuery(query);
    } catch (err) {
      console.warn("⚠️  Embedding query failed:", (err as Error).message);
      return [];
    }
  }

  const matrix = corpusMatrix!;
  const ids = corpusIds!;
  const dim = corpusDim;
  const n = ids.length;

  // Brute-force cosine over the whole corpus. matrix.subarray(...) is a view
  // (no data copy), so each row is scored by the shared cosineSimilarity helper
  // without allocating a per-document vector.
  const scores = new Float32Array(n);
  const candidateIndexes: number[] = [];
  for (let i = 0; i < n; i++) {
    if (documentFilter && !documentFilter(ids[i])) continue;
    const base = i * dim;
    scores[i] = cosineSimilarity(queryVec, matrix.subarray(base, base + dim));
    candidateIndexes.push(i);
  }

  // Select top-k by score from documents allowed by the caller's search filters.
  const order = candidateIndexes
    .sort((a, b) => scores[b] - scores[a])
    .slice(0, k);

  // Fetch metadata for just the winners (one IN query).
  const meta = fetchDocMeta(order.map((i) => ids[i]));

  const semanticWeight = CONFIG.EMBEDDING_WEIGHT;
  const results: SearchResult[] = [];
  order.forEach((i, rank) => {
    const id = ids[i];
    const m = meta.get(id);
    if (!m) return; // embedded doc_id missing from docs table (shouldn't happen)
    const rrfScore = rrf(rank + 1) * semanticWeight;
    results.push({
      id,
      text: `${m.title || ""}\n\n${m.description || ""}\n\n${id}`,
      bm25: 0,
      sourceId: extractSourceId(m.libraryId || id),
      path: id,
      relFile: m.relFile || "",
      finalScore: rrfScore,
      sourceKind: "semantic",
      debug: {
        rrfScore,
        boost: scores[i], // cosine similarity, for debugging
      },
    });
  });

  return results;
}

// ---------------------------------------------------------------------------
// Cross-encoder reranker (ms-marco-MiniLM-L-6-v2)
// ---------------------------------------------------------------------------
// Re-scores (query, doc) pairs jointly — cross-attention sees both texts at
// once, unlike the bi-encoder which scores them independently. More accurate
// but slower (~1-3s for ~150 pairs on CPU). Runs AFTER RRF fusion so it
// reorders the full deduplicated candidate pool, not a pre-filtered subset.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rerankClassifier: any = null;
let rerankLoadPromise: Promise<void> | null = null;

export async function loadRerankModel(cacheDir?: string): Promise<void> {
  if (rerankClassifier) return;
  if (rerankLoadPromise) return rerankLoadPromise;
  const dir = cacheDir ?? CONFIG.MODELS_DIR;
  rerankLoadPromise = (async () => {
    console.log(`🔀 Pre-loading reranker ${CONFIG.RERANKER_MODEL_ID} (cache: ${dir})...`);
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = dir;
    rerankClassifier = await pipeline("text-classification", CONFIG.RERANKER_MODEL_ID, {
      cache_dir: dir,
      dtype: "fp32",
    });
    console.log(`✅ Reranker ready.`);
  })();
  return rerankLoadPromise;
}

/**
 * Rerank docs by cross-encoder relevance score.
 * Returns the same docs sorted best-first. Falls back to fusion order on error.
 */
export async function rerank(
  query: string,
  docs: SearchResult[],
): Promise<SearchResult[]> {
  if (!CONFIG.RERANKER_ENABLED || docs.length === 0) return docs;
  try {
    await loadRerankModel();
    // title + description only — strip the trailing id path that adds noise
    const pairs = docs.map(doc => {
      const parts = doc.text.split("\n\n");
      return { text: query, text_pair: parts.slice(0, 2).join("\n\n") };
    });
    const scores = await rerankClassifier(pairs, { truncation: true }) as Array<{ label: string; score: number }>;
    return docs
      .map((doc, i) => ({ doc, score: scores[i]?.score ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .map(({ doc }) => doc);
  } catch (err) {
    console.warn("⚠️ Reranker failed, using fusion order:", (err as Error).message);
    return docs;
  }
}
