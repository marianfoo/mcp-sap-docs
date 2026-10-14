# Search ranking and optional embeddings

Offline search uses SQLite FTS5 (BM25), with the existing source, title and query-context
boosts. **Lexical ranking is the default** (`EMBEDDING_WEIGHT=0`). Optional online results
from SAP Help, SAP Community and Software-Heroes keep their existing scoring.

## Enable semantic ranking

Build a complete embedding artifact, then set a positive weight and restart the server:

```bash
npm run build:embeddings
EMBEDDING_WEIGHT=0.7 npm run start:streamable
```

`0.7` is an example, not a quality recommendation. Evaluate representative queries from
your own workload before enabling it. Our fixed 44-query comparison found real Top-1
regressions for CAP associations, UI5 scrolling and ABAP authority checks. This is why
semantic ranking remains opt-in. See [the fix plan](search-score-fusion-plan.md).

## How it works

1. BM25 supplies up to `max(k * 5, 50)` candidates after existing filters.
2. Semantic ranking compares those candidates' stored vectors with the query vector.
   It can reorder candidates; it cannot retrieve documents outside the lexical pool.
3. The top `k` semantic candidates contribute `weight / (60 + semanticRank)`.
4. The lexical and semantic contributions for each document are added, then the
   existing document boost applies once: `(lexicalRRF + semanticRRF) * (1 + boost)`.
   Documents without a semantic contribution retain their lexical scores.
5. Online results join the results, duplicates are removed and the top `k` are returned.

Taking the maximum previously kept only the larger contribution, usually the boosted
lexical one. It lost the additive contribution, but could still affect some rankings.
The fix sums only the independent lexical and semantic legs; repeated online URLs
still count once. Returned offline document IDs and fetch behavior are preserved.

## Model and artifact

The model is `Xenova/all-MiniLM-L6-v2`, FP32 ONNX via `@huggingface/transformers`.
Vectors have 384 dimensions and are stored in `dist/data/docs.sqlite`; the downloaded
model is cached in `dist/models/`.

Build vectors for **all** `markdown`, `jsdoc` and `markdown-section` document IDs.
Sections need their own vectors because they are distinct search candidates. Code
samples remain lexical-only and can lose relative rank to documents receiving a
semantic contribution. Storage is one vector per document ID: repeated headings can
share an ID, so their last stored vector may describe a different section of the same
file. These are additional opt-in limitations; ID construction is unchanged.

A missing eligible vector disables semantic ranking for
**all queries**, with one warning per database connection explaining the rebuild.
Older artifacts that omitted sections therefore use lexical search until rebuilt.
Missing embedding tables and unavailable models also fall back to lexical search.

`npm run build` includes `build:embeddings`. For a deployment upgrade, build and publish
the complete artifact before restarting the server. Do not rebuild a live database in
place: the builder replaces its embedding table. Rebuild both Docs and ABAP profiles
when syncing/releasing the upstream changes; a source-only update is insufficient for
semantic mode. Default lexical mode does not require embeddings.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `EMBEDDING_WEIGHT` | `0` | Semantic RRF weight; positive values enable it |
| `MODELS_DIR` | `dist/models` | Model cache directory |
| `MCP_PRELOAD_EMBEDDINGS` | `true` | Preload when weight is positive; `false` loads on demand |

Only finite positive weights enable semantic ranking; invalid, infinite or negative
values use zero. At zero the model is neither preloaded nor needed by search.

## Cost and verification

On the measured 45,066-row Docs corpus, adding section vectors increased distinct
vectors from 19,749 to 39,068, SQLite from 71.4 to 113.5 MiB, and embedding build time
from 154 to 466 seconds. These are local measurements, not deployment guarantees.
Both query latency and ranking quality depend on the corpus and hardware.

```bash
npm run test:url-generation   # fusion, configuration, fallback and artifact tests
TEST_MCP_PORT=43129 npm run test:integration:run
```

For semantic testing, run the integration command with `EMBEDDING_WEIGHT=0.7` after a
complete artifact build. This currently fails two of 42 relevance/identity checks. On
macOS, the runner's forced failure exit can also trigger the existing ONNX abort.
Also verify a representative MCP `search` request with
`includeOnline=false` at weights zero and a positive value. Old or incomplete artifacts
must produce the same lexical result at either weight and emit the rebuild warning.

## Upgrade note

The configured default changes from nominal `0.7` to `0`. Default IDs and scores
match the old default on our 44-query offline fixture and the reported RAP query, not
necessarily every possible query or result limit. Existing positive environment values
remain active: after a full artifact rebuild they enable the corrected semantic mode
and its documented relevance tradeoffs. Set `EMBEDDING_WEIGHT=0` to choose lexical
ranking explicitly.
