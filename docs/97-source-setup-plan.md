# Fix #97: setup must keep the documentation it fetched

## Cause

`setup.sh` fetches the latest source branches, then runs a recursive submodule
update from the project root. Git restores the recorded top-level commits.
The recorded Open UX commit predates the eight OPA5 skill files required by the
materializer, so `build:index` fails with `ENOENT` on `SKILL.md`.

## Fix

1. Update the Open UX pin to a verified commit containing all required inputs.
2. Initialize nested submodules inside each selected source, after fetching it.
   Keep the source itself at the fetched branch tip and preserve variant filtering.
3. Preserve `SKIP_NESTED_SUBMODULES` for deployments that only need the main docs.
4. Explain setup versus pinned-checkout behavior in the local setup instructions.

Do not add an old-document fallback or silently omit the OPA5 library. The
materializer should continue reporting missing required inputs.

## Verification

- Reproduce the exact build failure using the old Open UX pin.
- Run the real setup script against local Git fixtures: fresh checkout, upgrade
  from an old pin, repeat update, both variants and the nested-submodule opt-out.
- Test the recorded Open UX pin with the actual materializer on Linux and Windows.
- Build the real source through indexing, FTS and embeddings; verify OPA5 results
  and source URLs. Run the existing regression suite and full PR build.
- Obtain Claude Opus 5.5 Max review, address findings, merge after green CI and
  check the resulting workflows.

This fixes source setup; no MCP tool API or runtime dependency changes are needed.
