// Build pipeline step 3: Generates embedding vectors for markdown + jsdoc docs
// and stores them in the embeddings table in dist/data/docs.sqlite.
// Uses Xenova/all-MiniLM-L6-v2 (384-dim) via @huggingface/transformers.
// Model is downloaded once to dist/models/ and reused on subsequent runs.
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { pipeline, env } from "@huggingface/transformers";

const DATA_DIR = path.join(process.cwd(), "dist", "data");
const MODELS_DIR = path.join(process.cwd(), "dist", "models");
const SRC = path.join(DATA_DIR, "index.json");
const DST = path.join(DATA_DIR, "docs.sqlite");
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const BATCH_SIZE = 32;

type Doc = {
  id: string;
  title?: string;
  description?: string;
  keywords?: string[];
  type?: string;
};

type LibraryBundle = {
  id: string;
  docs: Doc[];
};

/**
 * Build the text to embed for a document.
 * Title + description + first 20 keywords — stays under ~256 tokens.
 */
function buildEmbedText(doc: Doc): string {
  const parts: string[] = [];
  if (doc.title) parts.push(doc.title);
  if (doc.description) parts.push(doc.description);
  if (doc.keywords && doc.keywords.length > 0) {
    parts.push(doc.keywords.slice(0, 20).join(" "));
  }
  return parts.join(" ").trim();
}

/**
 * L2-normalize a Float32Array in-place so cosine similarity = dot product.
 */
function l2Normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

async function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`Missing ${SRC}. Run npm run build:index first.`);
  }
  if (!fs.existsSync(DST)) {
    throw new Error(`Missing ${DST}. Run npm run build:fts first.`);
  }

  console.log(`📖 Reading index from ${SRC}...`);
  const raw = JSON.parse(fs.readFileSync(SRC, "utf8")) as Record<string, LibraryBundle>;

  // Filter: embed only markdown and jsdoc docs (not markdown-section or sample)
  const docs: Doc[] = [];
  for (const lib of Object.values(raw)) {
    for (const d of lib.docs) {
      if (d.type === "markdown" || d.type === "jsdoc") {
        docs.push(d);
      }
    }
  }
  console.log(`📄 Documents to embed: ${docs.length} (markdown + jsdoc only)`);

  // Configure transformers to store model in dist/models/ (project-local, gitignored)
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  env.cacheDir = MODELS_DIR;
  // Disable the default HuggingFace Hub cache path to ensure model lands in MODELS_DIR
  env.localModelPath = MODELS_DIR;

  console.log(`🤖 Loading model ${MODEL_ID} (cache: ${MODELS_DIR})...`);
  const extractor = await pipeline("feature-extraction", MODEL_ID, {
    cache_dir: MODELS_DIR,
    dtype: "fp32",
  });
  console.log(`✅ Model loaded.`);

  // Open existing docs.sqlite (built by build-fts.ts)
  const db = new Database(DST);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  // Fresh embeddings table (idempotent: re-run is safe)
  db.exec(`DROP TABLE IF EXISTS embeddings`);
  db.exec(`
    CREATE TABLE embeddings (
      doc_id TEXT NOT NULL PRIMARY KEY,
      vec    BLOB NOT NULL
    )
  `);

  const sizeBefore = fs.statSync(DST).size;

  const ins = db.prepare(`INSERT OR REPLACE INTO embeddings (doc_id, vec) VALUES (?, ?)`);

  const startTime = Date.now();
  let inserted = 0;
  let skipped = 0;

  // Process in batches
  const tx = db.transaction((batch: Doc[]) => {
    for (let i = 0; i < batch.length; i++) {
      const doc = batch[i];
      const text = buildEmbedText(doc);
      if (!text) {
        skipped++;
        return;
      }
      // embedding is already computed outside the transaction
      // We pass pre-computed vecs via closure
      const vec = batchVecs[i];
      if (!vec) return;
      ins.run(doc.id, vec);
      inserted++;
    }
  });

  // We need to compute embeddings per batch then insert
  let batchVecs: (Buffer | null)[] = [];

  for (let offset = 0; offset < docs.length; offset += BATCH_SIZE) {
    const batch = docs.slice(offset, offset + BATCH_SIZE);
    const texts = batch.map(buildEmbedText);

    // Embed batch
    const output = await extractor(texts, { pooling: "mean", normalize: false });

    // output.data is a flat Float32Array: [batch_size × dim]
    const flatData = output.data as Float32Array;
    const dim = flatData.length / batch.length;

    batchVecs = batch.map((_, i) => {
      const text = texts[i];
      if (!text) return null;
      const vec = new Float32Array(flatData.buffer, flatData.byteOffset + i * dim * 4, dim);
      const normalized = l2Normalize(new Float32Array(vec)); // copy + normalize
      return Buffer.from(normalized.buffer);
    });

    tx(batch);

    const pct = Math.round(((offset + batch.length) / docs.length) * 100);
    if (pct % 10 === 0 || offset + batch.length >= docs.length) {
      process.stdout.write(`\r  → ${offset + batch.length}/${docs.length} (${pct}%)`);
    }
  }

  process.stdout.write("\n");

  // Create index for fast lookups (doc_id is already PRIMARY KEY, so this is redundant but explicit)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_embeddings_doc_id ON embeddings(doc_id)`);

  db.close();

  const sizeAfter = fs.statSync(DST).size;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`✅ Embeddings built successfully!`);
  console.log(`   📄 Embedded: ${inserted} documents`);
  if (skipped > 0) console.log(`   ⚠️  Skipped (no text): ${skipped}`);
  console.log(`   ⏱️  Elapsed: ${elapsed}s`);
  console.log(`   💾 docs.sqlite: ${(sizeBefore / 1024 / 1024).toFixed(1)} MB → ${(sizeAfter / 1024 / 1024).toFixed(1)} MB (+${((sizeAfter - sizeBefore) / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`   📍 Location: ${DST}`);
}

import { fileURLToPath } from "url";
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error("❌ Error building embeddings:", error);
    process.exit(1);
  }
}
