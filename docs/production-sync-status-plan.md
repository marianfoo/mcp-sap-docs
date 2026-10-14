# Fix production sync and status checks

## Problems reproduced after the 0.3.56 deployment

1. The ABAP mirror had package version 0.3.56 but still reported 0.3.55 through MCP and `/health`. The sync used rsync's default size/timestamp check. Fresh checkouts can give different, equally sized files the same timestamp, so content changes are skipped.
2. The legacy HTTP `/status` route searched the entire corpus for `button`. That term has no ABAP FTS candidates, causing a synchronous fallback scan. A production request took 29 seconds and delayed other HTTP requests. A successful deployment workflow did not catch this.

## Small fixes

1. Add `--checksum` to the upstream and overlay rsync commands. Keep file selection, exclusions, overlay precedence and package identity unchanged.
2. Use one bounded SQLite FTS probe in `/status`. Report an unavailable index as unhealthy instead of falling back to an expensive search. Keep `/healthz` as the cheap process liveness check.

## Tests and review

- Run the actual sync script against local Git repositories with deterministic equal timestamps and same-sized edits. Check source content, overlay precedence, ABAP workflow preservation, package identity and an unchanged second sync. This fails before the fix and passes afterward.
- Exercise the HTTP status route for both variants with a valid matching index, a nonmatching index, an empty index, a missing database and an invalid database. Keep the probe bounded and the response truthful.
- Run TypeScript, the existing URL/discovery/integration suites, and the new regressions in CI.
- Review the combined exact commit with Claude Opus 5.5 at maximum effort; resolve findings before merging.

## Production verification

- Verify the synchronized source content and compiled runtime against the merged commit.
- Check both variants' public versions, MCP search/fetch, database integrity and ABAP lint.
- Confirm `/status` is responsive and `/healthz` remains responsive.
- Restore the resource-monitor timer to its recorded active/enabled state.
- Record the exact deployed commits and any corrective release still needed. Never change the already published 0.3.56 tag.
