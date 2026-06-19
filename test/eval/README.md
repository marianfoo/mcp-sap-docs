# Retrieval eval harness (roadmap item 0)

A fixed query set + ranking scorer. It gates every **ranking-sensitive** change in
[`docs/IMPROVEMENT-ROADMAP.md`](../../docs/IMPROVEMENT-ROADMAP.md) — version filtering
(item 1), section-aware fetch (7a), chunk/content embeddings (7b), the model swap
(item 3), and boost/dedupe tuning. Run it **before and after** any such change so the
effect is measured, not vibed.

## Run it

> Use **Git Bash**, not PowerShell — a couple of repo scripts embed bash-isms. The
> eval scripts themselves are plain `node` and run anywhere, but stay consistent.

```bash
npm run eval            # build TS, run the set, compare to baseline.json (read-only)
npm run eval:update     # same, then overwrite baseline.json with this run
node test/eval/run-eval.js --json   # machine-readable report on stdout
```

The runner spawns `dist/src/http-server.js` itself (same HTTP path as the integration
suite), so it scores the **currently built** `dist/`. Rebuild (`npm run build`) first if
you changed index/fts/embeddings and want those reflected.

## What it measures

One known-good target per query, so recall@k = success@k = **hit@k**.

| Metric | Meaning |
|--------|---------|
| `firstRelevantRank` | 1-indexed position of the first result matching an `expected` fragment (`MISS` if not in the returned list) |
| `MRR` | mean of `1/firstRelevantRank` across queries |
| `hit@k` | fraction of queries whose target lands in the top *k* (k = 1, 3, 5, 10) |
| `misses` | queries with no target in the returned results |

`npm run eval` prints a per-query rank column with a **Δrank vs baseline** (negative =
moved up = better) and aggregate deltas, so regressions are obvious.

## Curating ground truth

[`eval-queries.js`](./eval-queries.js) is seeded from live probes against v0.3.45
(commit `bd5d738`). `expected` fragments are case-insensitive substrings matched against
the printed `⭐️ **<id>**` library id/path — keep them stable (loio / file slug / heading
anchor), not full URLs.

- **Add** queries from real ABAP/CDS/UI5 sessions where grounding mattered.
- **Don't silently delete** a query because it scores badly — that inflates the average.
  A low score is the signal. Annotate it with a `note` instead.
- When the corpus (submodules) changes, re-probe and re-record the baseline.
