# Improve search hit@10

## Problem

As the corpus grows, unrelated documents can displace relevant results. The release
0.3.60 corpus has 60,607 entries from 55 sources. Its unchanged 69-query evaluation
finds an expected result in the top ten for 49 queries.

The investigation reproduced several small defects:

- SQLite BM25 weights did not match the schema: document type received the intended
  title weight. Title, description and keyword weights were shifted.
- Acronym substitution changed ordinary words: `exists` became `exisTypeScript`,
  and `wrap` triggered the RAP expansion.
- Query sanitization joined `AUTHORITY-CHECK` into an absent word and removed
  accented letters. User text must remain text, not FTS operators.
- Generic words such as `input`, `table`, `sample` and `control` implied UI5, including
  in backend questions. “How to” also boosted unrelated sample repositories.
- The sample-source list omitted newer repositories, so `includeSamples: false`
  still returned them. Sample context boosts also displaced explanatory guides.
- Ordinary coding preference questions did not activate the existing style-guide
  boost. Preference wording alone is insufficient for an unrelated product question.
- Asking for 10 versus 30 results changed the retrieval pool and therefore the top ten.

## Small fix

1. Align the existing BM25 weights with their columns.
2. Match acronyms and synonyms at word boundaries.
3. Preserve punctuation-separated words and Unicode in safely quoted FTS terms.
4. Use explicit frontend terms for UI5 context; recognize `itab` and internal tables
   as ABAP. Recognize Fiori Tools and keep explicit CAP questions from being
   dominated by ABAP keyword pages.
5. Read sample-source metadata as well as the compatibility list. Filter all samples
   consistently and apply their context/implementation boosts only to explicit
   example requests. A tutorial request asks for a walkthrough.
6. Recognize coding preferences and the Clean ABAP name without boosting style guides
   for general product recommendations.
7. Retrieve a fixed, bounded 200-candidate pool before returning the requested count.

Keep the existing ranking formula, model settings, IDs, URLs and artifact format.
No dependency, model service or index rebuild is needed.

## Verification

- Freeze both the release index and its matching source files. Do not fetch newer
  upstream content while comparing search changes.
- Preserve all 69 queries and gold paths. Report stale/narrow labels separately.
- Add regression fixtures for the concrete bugs and candidate-count consistency.
- Compare per-query ranks, old top-ten losses, MRR and warmed latency.
- Inspect additional frontend/backend, identifier, source-filter and flavor probes.
- Run the existing application/integration suites and actual MCP search/fetch.
- Obtain Claude Opus 5.5 max guidance and a final review of the patch and evidence.

## Harder experiments

Test content and retrieval changes separately before extending the patch:

- Replace breadcrumb/code-heavy previews with section prose.
- Search more section/document text in SQLite, including a separate body index.
- English word stemming.
- Broader retrieval using the existing MiniLM vectors.

Keep only changes with evidence of useful gains and acceptable regressions. The
initial experiments do not justify shipping these broader changes; details belong
in the evaluation report. Missing labels and upstream document-title quality remain
separate follow-up work, not reasons to edit the primary benchmark to improve its score.
