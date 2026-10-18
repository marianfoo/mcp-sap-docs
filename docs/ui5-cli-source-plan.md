# Restore UI5 CLI guides

## Cause

Setup followed UI5 CLI's `main` branch. That branch now develops v5 and moved
the user guides to `internal/documentation/docs`. Our `docs` checkout contained
maintainer material, while result URLs still pointed to the stable v4 site.

## Fix

- Follow the canonical `UI5/cli` repository's `v4` branch and record its current
  commit. Setup can continue receiving v4 documentation updates.
- Keep `docs`, the `/ui5-tooling` library ID, and the v4 URL base aligned.
  No new parser, source, ranking rule or dependency is needed.
- Name the source UI5 CLI and add regression coverage for real middleware
  documentation, search, fetch and nested page URLs.

## Validation and release

Test fresh setup and migration from an existing main-branch checkout. Rebuild
the frozen corpus with only this source changed. Check guide coverage, live
URLs, fresh UI5 queries, previous search regressions and full integration tests.
Require Claude Opus 5.5 Max review and CI before merging. Then include this fix
and the already merged description cleanup in release 0.3.62, and verify the
published version, deployments, and old/new content retrieval.

V5-only maintainer pages are outside the selected v4 corpus. The generated CLI
command-reference page and generated JavaScript API site are not Markdown
sources in this branch; this fix restores the committed user guides.
