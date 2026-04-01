# AGENTS.md

Operational guide for agents and contributors adding or updating documentation sources in this repository.

## What This Repository Does

`sap-docs-mcp` is an MCP server that:

- pulls documentation from git submodules under `sources/`
- builds a local search corpus in `dist/data/index.json`
- builds SQLite FTS and embeddings (`dist/data/docs.sqlite`)
- serves search/fetch tools for different variants (`sap-docs`, `abap`)

Core build/index flow:

1. `setup.sh` initializes/updates submodules (variant-aware)
2. `scripts/build-index.ts` scans configured source directories and creates `index.json`
3. `scripts/build-fts.ts` builds BM25 index from `index.json`
4. `scripts/build-embeddings.ts` builds semantic vectors

## Source Onboarding Model (Important)

Adding a source is **not** one change in one file. A source typically needs coordinated updates in multiple places:

1. `.gitmodules` (submodule URL/path/branch)
2. `scripts/build-index.ts` (`SOURCES` entry with indexing path + file patterns)
3. metadata config:
   - `src/metadata.json` for `sap-docs` profile
   - `config/variants/abap.metadata.json` if needed for `abap` profile
4. variant config:
   - `config/variants/sap-docs.json`
   - `config/variants/abap.json` (if source should exist in ABAP variant)
5. `setup.sh` sparse checkout mapping in `get_sparse_paths()` when only subfolders are needed
6. optional test/docs updates (README, tests, validation docs)

If any of these are missed, the source may clone but never be indexed, or index without usable URL generation, or only work in one variant.

## Where Source Configuration Lives

### 1) Submodule registration

- File: `.gitmodules`
- Purpose: declare repository origin and local path under `sources/`
- Pattern:
  - `path = sources/<source-folder>`
  - `url = https://github.com/<org>/<repo>.git`
  - `branch = main|master|...`

### 2) Indexing input

- File: `scripts/build-index.ts`
- Purpose: tells indexer exactly where docs live and which files to scan
- Structure: `SOURCES: SourceConfig[]`
- Required fields:
  - `repoName`
  - `absDir` (often `join("sources", "<folder>", "docs")` or repo root)
  - `id` (library ID used everywhere, e.g. `"/wdi5"`)
  - `name`, `description`
  - `filePattern` (`**/*.md`, `**/*.mdx`, etc.)
  - `type` (`markdown`, `jsdoc`, `sample`)

### 3) Search metadata and URL generation

- File: `src/metadata.json` (sap-docs)
- Purpose:
  - boosts, tags, synonyms/acronym context
  - source metadata for ranking and source identity
  - source URL construction (`baseUrl`, `pathPattern`, `anchorStyle`)

Minimal source entry fields:

- `id`
- `libraryId` (must match `build-index.ts` `id`)
- `sourcePath` (relative to `sources/`)
- `baseUrl`
- `pathPattern`
- `anchorStyle`
- `description`, `tags`, `boost`

### 4) Variant inclusion

- File: `config/variants/sap-docs.json`
  - add source `libraryId` to `sourceAllowlist`
  - add submodule folder path to `submodulePaths`
- File: `config/variants/abap.json`
  - only if source should be available in ABAP variant

### 5) Setup cloning behavior

- File: `setup.sh`
- Function: `get_sparse_paths()`
- If source indexing scans only a subfolder (for example `docs`), add sparse mapping so setup pulls only required paths.
- If whole repo is needed, no sparse mapping is required.

## Existing Patterns To Reuse

Examples already in repo:

- Docs in `docs/` folder:
  - `/btp-cloud-platform` -> `sources/btp-cloud-platform/docs`
  - `/sap-artificial-intelligence` -> `sources/sap-artificial-intelligence/docs`
- Docs from repo root:
  - `/cap` -> `sources/cap-docs`
- Mixed patterns (`mdx`, code docs, samples) exist in `cloud-sdk*` and `openui5`.

## Terraform Provider BTP Candidate

Candidate repository:

- [SAP/terraform-provider-btp docs folder](https://github.com/SAP/terraform-provider-btp/tree/main/docs)

Observed docs layout:

- `docs/index.md`
- `docs/data-sources/`
- `docs/functions/`
- `docs/list-resources/`
- `docs/resources/`

This matches the common "docs under `docs/`" onboarding pattern.

### Proposed source identity (suggested)

- submodule path: `sources/terraform-provider-btp`
- library ID: `/terraform-provider-btp`
- sourcePath: `terraform-provider-btp/docs`
- file pattern: `**/*.md`
- type: `markdown`

### Proposed metadata URL mapping (suggested)

- `baseUrl`: `https://github.com/SAP/terraform-provider-btp/blob/main`
- `pathPattern`: `/docs/{file}`
- `anchorStyle`: `github`

This is consistent with existing GitHub-hosted docs sources already configured.

## Step-by-Step Checklist For Adding A New Source

1. Add `.gitmodules` entry for `sources/<new-folder>`
2. Add new `SOURCES` entry in `scripts/build-index.ts`
3. Add metadata source in `src/metadata.json`
4. Add library mapping/context boosts only if useful
5. Add to `config/variants/sap-docs.json`:
   - `sourceAllowlist`
   - `submodulePaths`
6. Optionally add to `config/variants/abap.json` and ABAP metadata
7. Add `setup.sh` sparse path mapping if docs are in a subfolder
8. Run validation:
   - `npm run build:index`
   - `npm run build:fts`
   - `npm run build:embeddings`
   - or `npm run build`
9. Smoke test search:
   - start server
   - run `search` with source filter and verify URLs/fetch behavior

## Validation Commands

Typical local verification:

```bash
MCP_VARIANT=sap-docs npm run setup
MCP_VARIANT=sap-docs npm run build
MCP_VARIANT=sap-docs npm run start:streamable
```

Targeted checks:

```bash
MCP_VARIANT=sap-docs npm run build:index
MCP_VARIANT=sap-docs npm run build:fts
MCP_VARIANT=sap-docs npm run build:embeddings
```

## Notes For Future Agents

- `sourceAllowlist` and `SOURCES` must align; mismatches silently exclude content.
- `libraryId` must match across `build-index.ts`, metadata, and variant allowlists.
- `submodulePaths` controls what `setup.sh` clones; missing path means source absent locally.
- If URL generation looks wrong, verify `baseUrl` + `pathPattern` + `anchorStyle` first.
- `docs/DISCOVERY_CENTER/*` exists as local docs material but is not part of current indexing pipeline unless explicitly wired.

