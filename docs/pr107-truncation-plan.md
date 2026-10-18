# PR #107: bounded content with visible loss

## Problem and root cause

The released implementation assigned 60% of the budget to the beginning and 20%
to the end. Reserving the other 20% for a short notice wasted roughly 15,000
characters at the default limit. Broad boundary searches could discard more.
Clients could not reliably detect the loss without reading the notice.

PR #107 addresses this with a larger head, configurable limits and structured
metadata. Review reproduced three remaining defects: fixed notice reserves could
exceed tiny configured limits; a global regex used with `String.match()` never
supplied the tail boundary's `.index`; and a heading cut could leave only `##`.
The new tests also needed inclusion in the CI command.

## Simple fix

- Share budget/accounting code between the two existing truncation functions.
- Measure the largest notice; use compact markers for tiny budgets.
- Keep beginning/end excerpts; only move cuts a short distance for readability.
- Keep surrogate pairs intact and report all lengths in UTF-16 string units.
- Carry loss metadata through Community/SAP Help fetches without changing the
  external `text` field or MCP resource text type.
- Preserve the Community source URL separately, even when a tiny limit removes
  its text header.
- Keep the 75,000 default. Validate configuration as a positive safe integer.
- Document that excerpts cannot guarantee intact markup or complete sections.
  No parser, summarizer, new model, range API or dependency is added.

## Reproduction

Frozen live Community post `14505163`, retrieved on 2026-10-18: 75,318 formatted
characters. Released output: 58,573 characters. Original PR output: 72,652,
with 2,954 source characters omitted. Reviewed fix: 74,998 characters,
with 454 source characters omitted. The limit remains 75,000.

Original PR with an explicit limit of 100 returned 309 characters. The new
regressions sweep all positive limits through 500 and exercise both helpers,
Unicode, exact limits, long paragraphs, headings and tail boundaries.

## Validation

- Main test command includes all new tests; targeted tests exercise actual
  Community-to-MCP dispatch, both response forms, resources, and SAP Help citations.
- Local validation: 542 core tests and all 51 integration tests passed against
  the frozen release sources. The 69-query MCP HTTP comparison has identical
  ranks to #105. Real Community and offline fetches preserve text and citations.
- One initial integration run mixed old local source files with the frozen index
  and failed a URL check; rerunning against the matching release sources passes.
- Claude Opus 5.5 Max found no code blockers in the implementation review.
  Its documentation example and pipeline-coverage follow-ups were resolved.
  Already-aligned paragraph cuts are retained; 39 focused tests pass.
- The final unit suites run in the Git checkout (542 core, 34 SAP object and
  11 Discovery Center tests). Integration runs use the matching frozen corpus.
  Live SAP Help confirms truncation at 1,000 characters, retained citations and
  the string-wrapper contract. The Community CLI smoke tests pass.
- Keep release #106 held until the final PR head has passed review and CI.
