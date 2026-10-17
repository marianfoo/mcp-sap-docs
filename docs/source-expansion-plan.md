# Documentation source expansion

## Goal

Add the recommended BTP, Python SDK, and OData documentation to the SAP Docs profile. Research useful SAP tutorials and Business Accelerator Hub content as separate follow-up recommendations.

## Implementation

1. Add ten documentation repositories: Connectivity, OData vocabularies, Job Scheduling, Cloud Logging, Cloud Identity Services, its system integration guide, Integration Suite, Business Application Studio, Continuous Integration and Delivery, and Cloud Transport Management.
2. Add the Python documentation folders from the existing Cloud SDK and AI SDK repositories.
3. Reuse the current Markdown/MDX indexer. Index Integration Suite's consolidated `ISuite_Integrations_APIs` guide and the separate `ISuite_Event_Mesh` guide. The parallel `ci`/`apim` copies repeat content and have different navigation terminology. The selected two folders contain 1,709 Markdown files.
4. Align the indexer, source metadata/URLs, SAP Docs allowlist, git submodules, and sparse paths in setup.sh and Dockerfile. Keep ABAP profile membership unchanged.
5. Document source scope and attribution. Preserve source code examples, annotation tables, and experimental-status notices.

## Validation

- Test URL generation and source configuration, including nested paths and MDX files.
- Build the corpus and FTS database with real source files; verify every added bundle contains documents and readable source content.
- Exercise real MCP library discovery, search, and fetch for every added bundle; check representative existing sources as well.
- Build embeddings and verify coverage, plus the applicable regression and setup tests.
- Check that the ABAP profile excludes the new bundles.
- Review the diff and correct any findings before creating a PR.

The implementation adds 13 source bundles from ten new repositories and two existing SDK repositories (updated to revisions containing Python documentation). The SAP Docs profile grows from 39 to 52 source bundles. Each new bundle is also advertised in the SAP Docs MCP search tool description; the ABAP profile does not advertise them.

## Research outputs

- SAP tutorials: recommend specific folders based on usefulness, maintenance, current product versions, overlap, and compatibility with the current parser.
- Business Accelerator Hub: test API, event, CDS view, and other relevant content access; recommend a small useful scope and a simple retrieval approach based on actual responses.
