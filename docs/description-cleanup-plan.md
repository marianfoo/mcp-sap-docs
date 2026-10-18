# Markdown description cleanup

## Problem

Pages without an authored description used the first non-heading line. SAP
Markdown often starts with a LOIO comment or an empty HTML anchor, so search
displayed and indexed invisible metadata instead of an explanation.

## Fix

Use one small helper to find the first prose line. Remove comments and HTML
tags; skip script/style blocks, fenced code, headings and navigation decoration.
Limit the fallback to 400 characters. Keep authored descriptions, CAP synopsis
and the existing ABAP extraction unchanged. No new dependency or ranking rule.

## Validation

- Test real SAP-style comments and anchors, multiline comments, code fences,
  quoted notes, Vue imports, CRLF and preserved Markdown prose.
- Rebuild baseline and candidate from the same frozen sources. Compare every
  non-description field, document count and search result prefixes.
- Run the existing search regression set and fresh, pooled relevance judgments.
- Run unit and integration tests, then Claude Opus 5.5 Max review before merge.

The separate full-corpus MiniLM experiment stays local until fresh relevance
and concurrent-request measurements justify a production change.
