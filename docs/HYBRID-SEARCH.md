# Hybrid Search (BM25 + Embeddings)

The search system combines two independent rankers fused via Reciprocal Rank Fusion (RRF):

| Ranker | Technology | Strength |
|---|---|---|
| **BM25** (FTS5) | SQLite keyword index | Exact terms, code names, API names |
| **Semantic** (embeddings) | `Xenova/all-MiniLM-L6-v2` | Paraphrase, concept, natural-language |

This means queries like _"how to check if a user has permission"_ find `AUTHORITY-CHECK`
documentation even though none of those words appear in the query.

---

## How It Works

1. BM25 retrieves up to 200 candidates from the FTS5 index.
2. Pre-computed 384-dimensional embedding vectors for each candidate are fetched from SQLite.
3. The query is embedded with the same model (< 5 ms, model already warm).
4. Candidates are re-ranked by cosine similarity.
5. Semantic results are merged into the RRF pipeline alongside BM25 and online results.
6. Documents appearing in **both** BM25 and semantic results accumulate scores from both
   rankers — naturally rewarding results that are strong on both dimensions.

### RRF weights

| Source | Weight |
|---|---|
| Offline BM25 | 1.0 |
| Semantic | 0.7 (default) |
| SAP Help | 0.9 |
| SAP Community | 0.6 |
| Software-Heroes | 0.85 |

Tune the semantic weight via `EMBEDDING_WEIGHT=<float>` env variable.

---

## Model

- **Model ID**: `Xenova/all-MiniLM-L6-v2` (ONNX, via `@huggingface/transformers`)
- **Dimensions**: 384
- **Size on disk**: ~90 MB
- **Storage location**: `dist/models/` (gitignored, in-project — not in `~/.cache/huggingface`)
- **Download**: happens automatically on first `npm run build:embeddings` run

---

## Embedding Scope

Only `markdown` and `jsdoc` document types are embedded (~18,942 documents out of ~41,931 total):

| Type | Count | Embedded? |
|---|---|---|
| `markdown` | ~17,630 | Yes — primary docs |
| `jsdoc` | ~1,312 | Yes — UI5 API docs |
| `markdown-section` | ~18,273 | No — redundant with parent |
| `sample` | ~4,716 | No — poor semantic signal |

---

## Project Size Impact

| Component | Before | After | Delta |
|---|---|---|---|
| `sources/` | 1.8 G | 1.8 G | — |
| `node_modules/` | ~97 M | ~197 M | +100 M |
| `dist/data/docs.sqlite` | ~29 M | ~60 M | +31 M |
| `dist/models/` | — | ~90 M | +90 M |
| **Total** | **~5.8 G** | **~6.1 G** | **+220 M** |

The git repository itself does not grow — `dist/` is already in `.gitignore`.

---

## Build

`build:embeddings` runs automatically as part of `npm run build`:

```bash
npm run build          # tsc + build:index + build:fts + build:embeddings
```

Or run it separately (faster when only re-indexing embeddings):

```bash
npm run build:embeddings
```

The build is **idempotent** — it drops and recreates the `embeddings` table on every run,
so re-running is always safe. The model is downloaded once and cached in `dist/models/`.

---

## Daily Updates

The `update-submodules.yml` workflow calls `bash setup.sh`, which calls `npm run build`.
Since `build:embeddings` is part of `npm run build`, embeddings are rebuilt automatically
on every daily source update. No workflow changes are needed.

---

## Search Latency

| Operation | Time |
|---|---|
| FTS5 BM25 query | < 50 ms |
| Query embedding (model warm) | ~5 ms |
| Fetch 200 candidate BLOBs | ~2 ms |
| Cosine similarity × 200 | < 1 ms |
| **Added per search** | **~8 ms** |

The model is pre-loaded non-blocking at server startup. Cold start (first search after
boot) adds 2–5 s for model load, which is absorbed during server initialization.

---

## Memory

- Model resident in memory: ~90 MB (always loaded)
- Per-query: ~1 MB temporary (query vector + 200 candidate vectors)
- No in-memory embedding store — vectors are fetched from SQLite per query

---

## Tuning

| Env variable | Default | Description |
|---|---|---|
| `EMBEDDING_WEIGHT` | `0.7` | RRF weight for semantic results |
| `MODELS_DIR` | `dist/models` | Directory for model cache |

---

## Verification

```bash
# Check embedding table after build
sqlite3 dist/data/docs.sqlite \
  "SELECT count(*) FROM embeddings; SELECT length(vec) FROM embeddings LIMIT 1;"
# Expected: ~18942 rows, 1536 bytes (384 × 4)

# Artifact unit tests (fast, no server needed)
npm run test:embeddings

# Hybrid quality integration tests
node test/tools/run-tests.js --spec search.hybrid.spec.js
```
