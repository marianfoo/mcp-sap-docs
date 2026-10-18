# Search quality evaluation — 2026-10-18

## Result on the unchanged evaluation

The fixed 69-query set and all expected paths are unchanged. Both versions use the
published 0.3.60 corpus: **60,607 entries, 55 sources**, index SHA-256
`5b41a4d7571a20a09aa1d854bf3b422b6cb24c3769388eb89241587bcd576193`.

| Measure | Release 0.3.60 | This patch |
|---|---:|---:|
| Hit@10, evaluated at `k=30` | 49/69 (71.0%) | 51/69 (73.9%) |
| Hit@10 with an actual `k=10` request | 48/69 | 51/69 |
| Hit@1 | 36/69 | 35/69 |
| MRR@30 | 0.5866 | 0.6008 |
| Queries with a hit by position 30 | 51/69 | 53/69 |
| Top ten differs between `k=10` and `k=30` | 57/69 | 0/69 |
| Previously successful top-ten queries lost | — | 0 |

Full [per-query ranks](../test/eval/reports/2026-10-18-search-quality.json) include
regressions as well as gains. Two existing top-ten queries move down within the
top ten; the COLLECT paraphrase moves from rank 21 to outside 30. The two top-one
losses are `UI.SelectionFields` (definition 1→2, a relevant Fiori example first)
and Job Scheduling (index 1→3, usage/authentication pages first). CAP associations
improves 2→1. These changes are retained in the report rather than hidden by
changing labels.

The new top-ten hits are the inline-declaration and object-orientation preference
questions. All ten tutorial queries remain top-ten hits. This is a small measured
gain, not evidence of a general semantic-search breakthrough. The paired MRR
confidence interval includes zero. No golds were changed to increase the score.

Claude's final ablation retained the existing library-name weight of 1 while fixing
the shifted content weights and removing the document-type weight. Hit@10 stayed
51/69; MRR improved from 0.5894 to 0.6008.

## What was tested

The plan is in [search-hit-at-10-plan.md](search-hit-at-10-plan.md). Regression
fixtures cover real SQLite matching, schema weights, complete acronym terms,
hyphenated identifiers, Unicode, quoted phrases, safe FTS syntax, domain and
preference detection, metadata-defined sample filtering/boosting and `k` consistency.

Additional diagnostic queries were selected before the broader experiments. They
cover UI5 controls/binding, internal-table keys, CAP services, Cloud SDK TypeScript,
AUTHORITY-CHECK, CLEANUP, Terraform, destinations, tutorials, OData vocabularies,
Job Scheduling and Clean ABAP. These are diagnostic probes, not a blind statistical
holdout: findings were used to improve the patch.

The application and MCP integration checks must use matching source files as well
as the index. An initial local run paired the release index with older checkouts,
which produced a missing-frontmatter fallback URL. Repeating with the source files
extracted from the same release resolved that setup error without a URL-code change.

The existing core suite passes **502 tests**; the full integration suite passes
**51 tests** after the sample/source fixes, including actual MCP search/fetch for
new sources and all 32 curated tutorials. Final review refinements are rechecked
before merge.

## Experiments that were not shipped

All comparisons below used the same original queries/golds. They are development
experiments, not independent evidence of generalization.

| Experiment | Hit@10 | Why it was rejected |
|---|---:|---|
| Cleaner section previews | 49/69 | No measured gain |
| English Porter stemming | 48/69 | Lower hit count and MRR |
| Add full body text to the existing FTS table | 51/69 | MRR fell to 0.5408 |
| Separate body index plus rank fusion and preference intent | 52/69 | Lost an existing API-reference hit; roughly four times median query time |
| Full-corpus existing MiniLM vectors | 46/69 | MRR fell to 0.3872 |
| Equal rank fusion of dense results and baseline lexical results | 48/69 | Worse top-ten coverage despite more deep matches |

Removing title/ABAP boosts, using weighted BM25 directly, expanding stopwords,
changing title substring matching, and preserving the previous effective field
weights also failed to improve the complete set of relevance/integration checks.
Pre-limit language/source exclusions added latency without an evaluation gain.
The final patch keeps the existing index format, embeddings default and ranking
formula. It adds no model, service, dependency or query-specific gold-path rule.

## Remaining work

1. **Corpus quality:** some upstream ABAP titles are prose fragments rather than
   statement names. Section previews often contain breadcrumbs or opening code
   lines. Improve these with separate extraction fixtures and a frozen-corpus study.
2. **Natural-language paraphrases:** “reduce a byte string's size” does not name
   compression; “extend a class or wrap it” does not name composition. The tested
   body and dense approaches did not justify a default change.
3. **Evaluation labels:** the CAP event-handler gold `providing-services#event-handlers`
   is absent from this corpus; current guidance is under `guides/services/custom-code`.
   Some broad ABAP golds also accept obsolete/reference variants, while other narrow
   golds reject useful cheat-sheet answers. Curate those transparently in a separate
   evaluation revision, comparing both versions with the revised labels.
4. **Exact symbols and domains:** AUTHORITY-CHECK now returns results, but its main
   statement can still rank below DISABLE. Cloud SDK language targeting and OData
   vocabulary targeting also need better precision. The diagnostic probes record
   these limitations; they are not represented as solved.

## Reproduce

Build both revisions against the same `dist/data` and matching `sources` artifacts,
then run `node test/eval/run-eval.js --json` separately. The harness uses offline
search at `k=30`; also compare the same queries at `k=10`. Do not use `--update` or
rebuild from newer upstream sources for this comparison. Run `npm run test:url-generation`
and `npm run test:integration:run` against the candidate artifact. The shipped code
works with the existing database; no reindexing is required. Optional semantic
mode inherits the changed candidate pool; its score-fusion formula is unchanged.
The measurements here target the default lexical mode.
