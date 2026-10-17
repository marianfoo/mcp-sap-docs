# Curated SAP tutorial ingestion

## Scope

Add the 32 tutorials selected in `tutorials-and-api-hub-research.md`, in three
bundles: AI Core, HANA Cloud (including CAP), and Integration Suite. Keep the
existing OPA tutorial and the ABAP profile as they are.

## Implementation

1. `config/tutorials.json` lists the exact tutorial IDs. Setup, Docker, and the
   build use that same list. Update the tutorial repository pin for the new MCP
   Gateway article.
2. Prepare small Markdown copies during the build, using the existing generated
   source pattern. Preserve author metadata, prerequisites, code and warnings.
   Convert website option controls to readable labels and resolve relative
   tutorial, download and image links. Code fences are never rewritten.
3. Cite the published Developer Center page, without invented section anchors.
   All 32 pages were checked: 31 are published; the transport overview returns
   404 and therefore cites its actual GitHub source file.
4. Index the prepared files with the existing Markdown pipeline. Add product
   context to whole-document titles and keywords, so generic titles such as
   "Create Stored Procedures" can be found with HANA/SQLScript searches.
   Reuse the existing embedded-source URL generator for source citations.
5. Keep tutorial examples distinguishable from product references. The deferred
   masking example and older tutorials remain outside the explicit selection.

## Validation and acceptance

- Verify all 32 selected source files, generated documents, citation URLs and MCP
  fetches. Preserve code blocks byte-for-byte and prerequisites in every file.
- Verify checkout coverage and exclusion of deferred tutorials. No broad prefix
  globs or automatic catalog ingestion.
- Run 10 unfiltered tutorial discovery queries plus the 59 existing eval queries.
  Record regressions without deleting difficult queries or changing global weights.
- Run URL, source setup, integration and embedding checks, then Claude Opus 5.5
  at max effort and our own review. Merge only when the required checks pass.
- After release, verify the deployed version and old/new source search/fetch
  roundtrips. These are ingestion tests; the tutorials' SAP tenant provisioning
  and business operations are not executed as part of documentation ingestion.

## Measured result before release

The 10 tutorial queries return the intended tutorial at ranks 1–2. Of the 59 prior
queries, 58 retain their rank; the existing natural-language inline-declaration
query moves from rank 11 to 12. No existing hit in the top 10 is lost. The original
18 lexical/paraphrase misses remain visible. No ranking weights are changed.

Final relevance review removed topic-specific group tags: SQLScript tutorials
must not inherit CAP tags, and transport tutorials must not inherit MCP Gateway
tags. Only shared product names and `tutorial` are added to each group; individual
IDs, titles and content supply the task terms. All 69 eval ranks stayed unchanged,
and a scoped `MCP Gateway` search returns only the actual Gateway tutorial and
its sections.

## Claude review fixes

- The preservation tests now prepare fresh output in a temporary directory, so
  they exercise current code without depending on an earlier build.
- Every generated GitHub/raw asset link is checked against Git's exact,
  case-sensitive file tree. This caught the upstream `Bruno_Collection.json`
  download typo. The same tutorial folder contains `img/bruno_config.json`, a
  valid Bruno export with the documented V2 completion requests; a single
  explicit asset override points to that verified HTTP-200 file.
- Clear generated tutorial output before checking input availability, preventing
  stale files from being indexed when the checkout is absent.
- AI group tags now also contain only the shared product name and `tutorial`.
  All 69 eval ranks are unchanged after these fixes.
