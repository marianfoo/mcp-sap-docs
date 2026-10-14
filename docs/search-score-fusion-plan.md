# Fix semantic score fusion while preserving the tested lexical behavior

## Problem and root cause

[ABAP server issue #5](https://github.com/marianfoo/abap-mcp-server/issues/5) belongs
in this upstream search implementation. The semantic ranker produces another score
for an existing offline document. Deduplication kept the larger score instead of
adding both independent contributions, usually discarding the smaller semantic one.
On the fixed 44-query evaluation and the reported RAP numbering query, current main
returned exactly the same IDs and scores at weights `0` and `0.7`. An actual ABAP
MCP/stdio call reproduced this on a separately built ABAP corpus.

## Small implementation plan

1. Add the semantic rank contribution to each offline candidate once. Apply the
   existing document boost to both legs; preserve IDs, metadata, filters and online
   deduplication.
2. Include Markdown sections in the existing embedding build. Whole-document-only
   vectors otherwise unfairly favor pages over unembedded sections.
3. Check complete document/section coverage once per database connection. Any missing
   eligible vector means consistent lexical fallback for every query, with one
   rebuild warning. Samples remain lexical-only.
4. Default to lexical ranking: `EMBEDDING_WEIGHT=0`, without model preloading. Its
   output matches the previous default on the tested queries. Positive weights remain
   an opt-in using the existing parameter.
5. Test scoring, boosts, filters, fallback, configuration, artifact contents and real
   MCP requests. Keep the unchanged full integration suite as the default gate.

No new model, ranking service, configuration option, ID scheme or query-specific rule.

## Why semantic ranking stays opt-in

Same 44 unchanged queries/golds, same frozen raw sources, offline `k=30`:

| Variant | MRR@30 | Hit@1 | Hit@30 | Query-warm P50/P95 |
|---|---:|---:|---:|---:|
| Previous default, nominal weight 0.7 | 0.4418 | 18/44 | 26/44 | 7.8 / 23.8 ms |
| Fix, default weight 0 | 0.4418 | 18/44 | 26/44 | 5.8 / 21.2 ms |
| Fix, explicit weight 0.7 | 0.4256 | 16/44 | 26/44 | 7.7 / 23.5 ms |
| PR #71, its default weight 1.0 | 0.4333 | 16/44 | 34/44 | 61.6 / 80.1 ms |
| PR #71, equal weight 0.7 | 0.3903 | 14/44 | 26/44 | 61.7 / 79.3 ms |

Default IDs and scores remain identical across all 44 queries. Opt-in correctly changes
scores/ranking, but it is not a general relevance improvement. Manual review found:

- CAP association introduction displaced by a HANA migration section.
- UI5 scroll-loading reference displaced by a less precise growing-table tutorial.
- ABAP `AUTHORITY-CHECK` reference displaced by `AUTHORITY-CHECK DISABLE`; broad gold
  matching hides this regression even though the correct reference remains second.

A first additive-only fix also failed: it favored pages with vectors; adding section
vectors improved aggregate metrics but caused three existing integration failures.
Applying the existing boost to both legs reduced those to two at explicit weight 0.7
(FAQ section identity and CAP source visibility when online results compete). Those
opt-in runs also hit a native ONNX shutdown error on macOS. A successful search followed
by the existing runner's `process.exit(1)` reproduced the same abort in both unchanged
baseline and fixed code. This is an existing forced-exit runtime issue; the two search
quality failures remain separate limitations and are not passing gates. The
lexical default passes the existing integration suite; no tests or golds were weakened.

## PR #71 decision

Do not merge the broad PR as part of this fix. Its full-corpus dense retrieval produces
more deep gold matches at its default weight, but does not improve Top-1 precision
here and costs roughly eight times the warm median latency. It also changes ID
construction, section granularity, boosts and defaults, so it is not an isolated fusion
comparison. Full-corpus retrieval may merit a separate experiment with document-level
labels and production-representative queries. Reranking and news classification are
not needed to fix the confirmed score-loss bug.

## Measurement limits

The corpus was rebuilt from the same 24,465 files for all arms. Main index: 45,066 rows;
PR #71: 48,683 distinct IDs because its chunking/ID design differs. Model and cache:
`Xenova/all-MiniLM-L6-v2`, FP32, 384 dimensions. PR #71 reranker disabled; its boosts
are disabled, whereas the minimal fix preserves existing boosts. No weight tuning or
gold edits followed the results. Baseline used its own unchanged compiled helpers.

These 44 broad, partly substring-based golds are a limited diagnostic set. Hit@30 is
query coverage, not exhaustive document recall; MRR is truncated at 30. Paired
bootstrap intervals include zero. Manual source review takes precedence over misleading
gold matches. Latencies are one local machine, three passes; query-warm values use
passes two and three. RSS is sampled before artifact hashing and includes the whole
search session. First-search timing excludes module import. No general quality or
production latency claim follows from this benchmark.

## Release handoff

Ship the upstream fix, sync it to the ABAP mirror and release both services. Default
IDs and scores match the previous default on the 44-query suite and issue query; this
is not a claim for every possible query. Deployments explicitly setting a positive
weight must review the opt-in limitations. Before enabling semantic mode, rebuild the complete embeddings
for each profile and restart with the new artifact. Old/partial artifacts deliberately
stay lexical with a warning. Do not rebuild a live database in place.

The Docs build grew from 19,749 to 39,068 vectors, 71.4 to 113.5 MiB SQLite and 154 to
466 seconds. PR #71 needed 43,967 vectors, 126.0 MiB and 653 seconds on the same machine.
Source-only deployment is insufficient for the new semantic mode. No separate mirror
implementation is needed; the upstream sync carries the fix.

The current deploy workflow stops services before setup/build. Before deployment,
measure the complete build on the target host or equivalent staging system and state
the expected downtime. The local extra 312 seconds is not a host prediction. Do not
start deployment solely from these workstation timings.
