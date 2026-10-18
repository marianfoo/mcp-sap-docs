# Keep existing installations aligned with fresh builds

## Observed problems

The v0.3.59 image passed all 62 old/new content checks, but a full evaluation of
the public server lost the English DSAG package-architecture result. Fetching the
same document returned German text. Deployment logs showed that setup fetched
`1DSAG/ABAP-Leitfaden`, while `.gitmodules` selects the English
`marianfoo/DSAG-ABAP-Guide` fork.

Setup creates standalone clones as well as Git submodules. `git submodule sync`
does not update the remote of those standalone clones. The existing-update path
changed the branch/refspec but left the old `origin` URL in place.

The same release also showed a deployment timing problem: the full SAP Docs build
took about 36 minutes, while the downstream ABAP job stopped waiting for their
shared lock after 30 minutes. It failed before stopping the old ABAP service.

## Small fixes

1. Set an existing source checkout's `origin` to the URL from `.gitmodules` before
   sparse checkout and fetch. Fresh clones already use that URL.
2. Keep the shared deployment lock. Allow 60 minutes to wait and a further 60
   minutes for the build in both deployment workflows, including the maintained
   ABAP overlay.
3. Maintain the current CAP path and two reviewed UI5 relevance judgments in
   the retrieval evaluation.
   Retain all old expectations, queries and misses; report label changes
   separately from ranking changes.

## Validation

- A real Git fixture reproduces a standalone clone with a changed configured
  repository URL. It fails on the old script because `origin` remains unchanged.
- With the one-line remote update, all five setup scenarios pass, including
  repeated setup, sparse paths, nested dependencies and variant isolation.
- Linux and Windows CI run the same real Git fixture. Full corpus/embedding CI
  remains the merge gate, alongside final Claude and implementation reviews.
- Publish the corrected version. Check both public servers and the published
  image, including English DSAG retrieval and all old/new content probes.
- Compare all 69 query ranks between the published image and production to catch
  source drift even when source counts match.
