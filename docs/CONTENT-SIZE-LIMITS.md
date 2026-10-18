# Content size limits

SAP Help pages and SAP Community posts returned by `fetch` default to at most
75,000 JavaScript string units (UTF-16), including markup and the truncation
notice. This is a character budget, not a token guarantee. Offline documentation
is not affected by this setting.

## Configuration

Set the environment variable before starting the server:

```sh
MAX_CONTENT_LENGTH=100000 npm run start:streamable
```

The value must be a positive safe integer. Missing, zero, negative, fractional,
non-numeric and unsafe values fall back to 75,000. Very small limits are supported,
but leave little room for useful content. Changing the value requires a restart.

## What clients receive

Unchanged documents have no `metadata.truncation` field. Shortened documents
include this record in both the JSON text response and `structuredContent`:

```json
{
  "wasTruncated": true,
  "originalLength": 90000,
  "truncatedLength": 75000,
  "omittedCharacters": 15136
}
```

`originalLength` counts the formatted source before truncation. `truncatedLength`
counts the returned text including the notice. `omittedCharacters` counts only
removed source text; it is not `originalLength - truncatedLength`, because the
notice adds characters.

## How excerpts are selected

1. Measure space for the notice, including its largest possible numbers.
2. Keep about 80% of the remaining budget from the beginning and 20% from the end.
3. Prefer nearby paragraph, heading or sentence boundaries, moving each cut by
   no more than 200 characters. Avoid splitting a Unicode surrogate pair.
4. Put the loss notice between the excerpts. Tiny budgets use `[truncated]` or
   `…`; the metadata still reports the exact loss.

The beginning-only helper uses the same budget and accounting rules.

These are excerpts. They can contain incomplete sentences, HTML tags or code
blocks. Complete sections and valid Markdown/HTML are not guaranteed. Open the
source URL to read the full document; repeated fetches with the same settings
return the same excerpts. Range retrieval is not implemented.

## Tests

The main CI command (`npm run test:url-generation`) includes truncation,
configuration, Community fetch, SAP Help metadata and resource-read regressions.
See [the PR #107 investigation](pr107-truncation-plan.md) for reproduction and
validation results.
