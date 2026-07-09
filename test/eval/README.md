# Retrieval eval harness

A fixed query set and MRR scorer for measuring search quality. Run it before and
after any ranking-sensitive change so the effect is measured, not guessed.

## Quick start

```bash
npm run build:tsc
node test/eval/run-eval.js           # compare vs baseline.json
node test/eval/run-eval.js --update  # run + overwrite baseline.json
node test/eval/run-eval.js --json    # machine-readable report on stdout
```

The runner starts `dist/src/http-server.js` itself, so it scores the currently
built `dist/`. Rebuild first if you changed index/embeddings config.

`baseline.json` is the deterministic offline snapshot for the recorded variant
and search options (`includeOnline=false`, `k=30`). The runner warns when those
settings do not match. Use `--update` only when intentionally accepting a new
baseline after rebuilding the same corpus configuration.

## What it measures

Each query carries a `golds` array — **any matching fragment counts as a hit**
(multi-gold). This avoids penalising systems that return a different but equally
valid answer. Relevance in search is a judgment call, not ground truth; the
harness measures directional improvement, not absolute recall.

| Metric | Meaning |
|--------|---------|
| `firstRelevantRank` | 1-indexed position of the first result matching any `golds` fragment; `MISS` if no gold appears in the returned list |
| `MRR` | mean reciprocal rank across all queries |
| `hit@k` | fraction of queries whose first gold lands in the top *k* (k = 1, 3, 5, 10) |
| `misses` | queries with no gold in the returned results |

The report also prints a **bootstrap 95% CI on ΔMRR** and a **sign test on
hit@3 flips**. At n = 44, most single-change deltas land within noise by design —
the harness is built to resist over-claiming. Treat MRR as directional and use
per-query MISS→hit flips and the pairwise judgment for decisions.

## Query set structure

[`eval-queries.js`](./eval-queries.js) contains 44 queries spanning ABAP, CDS,
RAP, UI5/Fiori Elements, CAP, BTP, and wdi5. Three cohorts stress different
recall levers:

- **Lexical-gap** — phrased in user language with no keyword overlap against the
  corpus. A system relying on keyword matching alone will miss these.
- **Coverage-test** — gold is a `markdown-section` chunk. These miss on any
  system that only embeds whole documents; they act as canaries for section-level
  indexing coverage.
- **Paraphrase** — gold is an embedded `markdown` doc queried in natural language.
  Measures semantic recall without keyword co-occurrence.

`golds` fragments are matched case-insensitively as substrings against the
library id/path on each `⭐️ **<id>**` result line.

## Curation guidelines

- **Add** queries from real sessions where grounding mattered.
- **Don't silently delete** a query because it scores badly — that inflates the
  average. A low score is the signal; annotate with a `note` instead.
- `pairwise-vanilla.json` is append-only — never re-run `collect-vanilla-workflow.js`
  for queries already collected (it is expensive). Add new queries only.

## Pairwise eval

`pairwise-eval-workflow.js` is a Claude Code workflow that runs an LLM-as-judge
comparison between two systems head-to-head. It requires a connected MCP session.
`pairwise-vanilla.json` contains pre-collected vanilla upstream results for all
44 queries and is the reference side of the comparison.

Both workflow scripts accept an `args` object to configure which MCP server to
call, so they work regardless of how your server is registered:

```js
// collect vanilla results from an upstream server
Workflow({ scriptPath: 'test/eval/collect-vanilla-workflow.js',
           args: { vanillaTool: 'my-upstream-server search' } })

// run pairwise eval against a local server
Workflow({ scriptPath: 'test/eval/pairwise-eval-workflow.js',
           args: { localTool: 'my-local-server search' } })
```

The value is passed directly to `ToolSearch` — use a keyword fragment (e.g.
`'my-server search'`) or an exact name (e.g. `'select:mcp__my-server__search'`).
Defaults match the naming convention used in this repo.

**Limitation:** presentation order is not swapped (local system always shown
first), which can introduce positional bias in the LLM judge. Read win margins
as directional, not definitive.
