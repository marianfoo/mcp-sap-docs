# Runtime dependency advisories

## Problem

The production image runs `npm ci --omit=dev` from the committed lockfile. On
`main` (`531536c`), `npm audit --package-lock-only --omit=dev` reports 18
advisories: 2 critical, 13 high, and 3 moderate. The declared version ranges
already allow fixes for 16 of them; the lockfile pins older transitive versions.

## Fix

1. Keep the lockfile refresh contributed in #89. Do not change package ranges
   or application code for this update.
2. Run a production-only audit in PR CI and fail on future critical advisories.
   Two high advisories remain, so a high-severity gate would fail every PR.
3. Handle the remaining `sharp` / `@huggingface/transformers` advisories
   separately. The patched `sharp` needs Node 20.9+, while this PR's CI uses
   Node 18. Test a `sharp` override or Transformers upgrade on Node 22 before
   changing the embedding stack. Do not describe this PR as audit-clean.

## Verification

- Compare production audit counts before and after the lockfile refresh.
- Run `npm ci`, TypeScript build, and focused local tests.
- Check that only allowed package versions changed and that the Node 18 PR
  workflow can install the lockfile.
