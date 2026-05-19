---
name: ui5-version-upgrade
description: Plan and execute a SAPUI5/OpenUI5 version upgrade. Use when the user is bumping the UI5 version in manifest.json / ui5.yaml and wants to know which deprecated APIs they still use, which workarounds can be dropped, and which fixes already shipped. Combines this server's `ui5_version_diff` tool with the SAP `@ui5/mcp-server` tools (`run_ui5_linter`, `run_manifest_validation`, `get_api_reference`, `get_project_info`, `get_version_info`).
---

# UI5 Version Upgrade

A migration-assist workflow for SAPUI5/OpenUI5 projects. Two MCP servers cooperate here:

- **This server** (`mcp-sap-docs`) provides `ui5_version_diff`: lists FEATURE / FIX / DEPRECATED changes between two UI5 releases from [ui5-lib-diff](https://github.com/marianfoo/ui5-lib-diff).
- **`@ui5/mcp-server`** (separate, by SAP, runs locally per project) provides code-level tools: `run_ui5_linter`, `run_manifest_validation`, `get_api_reference`, `get_project_info`, `get_version_info`, etc.

The skill expects both to be configured. If `@ui5/mcp-server` is not available, fall back to manual code-grep for the code-level steps and tell the user which tool would have helped.

## When to use

Trigger this skill when the user says any of:

- "I'm upgrading from UI5 X.Y to X.Z, what do I need to fix?"
- "What's deprecated between 1.108 and 1.130?"
- "Can I drop this workaround now that we're on 1.130?"
- "Migrate the manifest to UI5 1.x"
- "Audit our UI5 code for deprecations"

## Inputs to gather first

Before running anything, get:

1. **Project root** — needed by `@ui5/mcp-server` tools that operate per-project.
2. **`from_version`** — current UI5 version. Read it from the project. If `@ui5/mcp-server` is available, call `get_project_info` / `get_version_info`. Otherwise read `webapp/manifest.json` (`sap.platform.cf.ui5VersionNumber` or `sap.ui5.dependencies.minUI5Version`) or `ui5.yaml` / `package.json` (`@sapui5/distribution-metadata`, `@openui5/...`).
3. **`to_version`** — the version the user wants to move to. If unsure, suggest the latest LTS minor available in `versionsInRange` after a probe call.
4. **`library`** — "SAPUI5" if commercial libs (`sap.suite.*`, `sap.ui.comp`, `sap.fe`, `sap.ui.mdc`) are present; "OpenUI5" otherwise.

## Workflow

### 1. Establish the upgrade scope

```text
ui5_version_diff(library, from_version, to_version)            # full picture (counts)
```

Read `counts` and `versionsInRange`. Print a one-paragraph summary:
"Upgrading $library from $from to $to covers N versions, with F features, X fixes, D deprecations."

### 2. List deprecations and map them to code

```text
ui5_version_diff(library, from_version, to_version, types=["DEPRECATED"], limit=1000)
```

For each deprecation entry, the `text` typically starts with `[sap.x.y.Control#method]` or names a control. For each one:

- If `@ui5/mcp-server` is available: call `run_ui5_linter` on the project. The linter already flags deprecated API usage; cross-reference its findings with the diff entries to know **which deprecations actually affect this project**. Do not list every deprecation — only the ones the linter confirms are in use.
- Otherwise, grep the project (`webapp/**/*.{js,ts,xml,json}`) for the control / API names from the entries and report a confirmed-use list.

For each confirmed-in-use deprecation, fetch the replacement details:

```text
get_api_reference(name=<the replacement API mentioned in the deprecation text>)
```

Produce a table: deprecated API → replacement → file:line where used.

### 3. Find workarounds that can be dropped

Ask the user which symptoms / bug numbers / phrases their codebase still works around (look in comments: `TODO`, `FIXME`, `workaround`, `BCP`, internal ticket IDs). For each candidate:

```text
ui5_version_diff(library, from_version, to_version, types=["FIX"], query=<symptom keyword>)
```

If `entries.length > 0`, the workaround can likely be removed. Cite the commit URL from the entry so the user can review the actual fix.

### 4. Surface relevant new features

```text
ui5_version_diff(library, from_version, to_version, types=["FEATURE"], ui5_library=<each lib the project depends on>)
```

Iterate over the project's declared dependencies (from `manifest.json` → `sap.ui5.dependencies.libs`). Keep the list focused on libs the project actually uses — don't dump every new feature in every library.

### 5. Validate the manifest for the target version

```text
run_manifest_validation(manifestPath=<project>/webapp/manifest.json)
```

Report any schema violations that the new version surfaces.

### 6. Re-lint after changes

When the user has applied fixes, run `run_ui5_linter` again to verify the deprecation count dropped.

## Output format

Default to a single Markdown report with these sections, in this order:

1. **Scope** — library, from → to, counts, versions covered
2. **Deprecations to address** — table of (API, replacement, file:line, commit_url)
3. **Workarounds that can be removed** — list with the commit_url that proves the fix shipped
4. **New features worth adopting** — bulleted per library, only the ones relevant to declared deps
5. **Manifest validation results** — pass/fail with details
6. **Next steps** — concrete edits to make, in order

Keep entries terse. Link to commits, don't paste them. If `ui5_version_diff` returns `truncated: true` for any call, mention that and offer to drill down by `ui5_library` or `query`.

## Constraints

- **Do not paste full `ui5_version_diff` results into the report** — they are long. Summarize counts, then list only project-relevant entries.
- **Do not invent deprecations.** Only list what `ui5_version_diff` actually returned for the given range.
- **Never call `@ui5/mcp-server` tools speculatively** — always pass a real project path you obtained from the user or detected on disk.
- The `@ui5/mcp-server` tool is `run_ui5_linter` (note the `_linter` suffix), not `run_ui5_lint`.

## Failure modes

- `ui5_version_diff` returns `from_version must be <= to_version`: swap the order or ask the user.
- `@ui5/mcp-server` is not installed: tell the user how to add it (`npm i -D @ui5/mcp-server`) and proceed with degraded coverage (no linter cross-reference, no manifest validation, no API reference lookup).
- A deprecation mentions an API the user doesn't seem to use: skip silently — the goal is signal, not exhaustiveness.
