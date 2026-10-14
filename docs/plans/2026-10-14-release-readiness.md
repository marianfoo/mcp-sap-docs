# Restore SAP Docs builds before releasing 0.3.56

## Problem and root cause

Daily GHCR image builds have failed since October 7, and the October 11 source
refresh failed with the same missing-file error. SAP/open-ux-tools [PR #5000](https://github.com/SAP/open-ux-tools/pull/5000)
replaced `data_local/opa5_docu.md` with eight OPA5 skill documents. Our build still
required the removed file, so every fresh corpus build stopped before indexing.

A fresh production dependency audit also found a new critical advisory in
`proxy-addr` and a high advisory in the MCP SDK. The existing package ranges
allow compatible patched versions, but the lockfile still pinned older ones.

## Fix plan

1. Point the existing OPA5 library at the eight replacement documents. Keep the
   library ID and chunk format. Preserve failure for missing configured input,
   so incomplete libraries are not silently published.
2. Encode each source URL path segment separately, preserving the nested path
   in GitHub provenance links. Use section headings outside fenced code for
   human-readable titles with parent-document context, short basenames for IDs, and skip skill frontmatter
   without changing source line numbers.
3. Refresh only `proxy-addr` (2.0.7 → 2.0.8) and the MCP SDK (1.26.0 → 1.32.1)
   in the lockfile. Keep root dependency ranges unchanged.
4. Merge this repair before release PR #87, then verify the refreshed release
   head. Merging #87 creates v0.3.56 and triggers production deployment, GHCR
   publication, and synchronization to abap-mcp-server.

## Verification

- Reproduced the original ENOENT against current upstream Open UX sources.
- Added a regression that failed before the repair and passes afterward. It
  checks all eight replacement documents and their pinned nested GitHub URLs.
- Retained the existing chunk/line-range test and verified missing configured
  input still fails.
- Clean dependency installation and TypeScript compilation pass.
- Production audit now passes the critical gate: zero critical, five high,
  seven moderate findings. Remaining findings need separate dependency work;
  this is not an audit-clean tree.
- Full URL suite: 358 passing; Discovery Center: 11 passing; session/event/SSE
  tests: 11 passing.
- Fresh corpus and FTS build: 39 libraries, 45,066 documents, including 212
  generated Open UX chunks. Local validation uses current Open UX sources and
  existing local copies of the other sources; PR CI refreshes all sources.

## Review follow-up

Claude Opus5.5 Max identified missing section titles and a code comment being
used as a title in the upstream skill documents. Heading extraction now ignores
fenced code, accepts all heading levels, and skips initial skill metadata.
The first revision lost parent-document context in section titles; real Linux
CI caught the resulting UX UI5 search regression. Section titles now include
the parent title. The original broad-search assertion remains unchanged.
