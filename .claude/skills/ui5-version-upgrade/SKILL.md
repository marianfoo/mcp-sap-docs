---
name: ui5-version-upgrade
description: Plan and execute a SAPUI5/OpenUI5 version upgrade. Use when the user is bumping the UI5 version in manifest.json, ui5.yaml, package.json, or an existing UI5 app and wants to identify deprecations in use, fixes that remove local workarounds, relevant new features, manifest/schema issues, and API replacements. Combines this server's `ui5_version_diff` tool with SAP's `@ui5/mcp-server` tools.
---

# UI5 Version Upgrade

A migration workflow for SAPUI5/OpenUI5 projects. Use two MCP servers together:

- **`mcp-sap-docs`** provides `ui5_version_diff`, backed by a local ui5-lib-diff all-changes JSON bundle. It answers "what changed between versions?" and includes SAPUI5 What's New entries for the same range.
- **SAP `@ui5/mcp-server`** runs against the local project. It answers "what does this app use and what is broken?"

Do not scrape the ui5-lib-diff browser route for JSON. The browser URL with `versionFrom`, `versionTo`, and `ui5Type` is client-rendered. Use `ui5_version_diff`; it reads the local `all-changes.json` bundle and returns all matching structured entries. `npm run setup` refreshes the bundle automatically; if it is missing or stale, refresh it during setup/rebuild with `npm run download:ui5-lib-diff` or point `UI5_LIB_DIFF_BUNDLE_PATH` to a local copy. The runtime is local-only and must not rely on external requests.

## UI5 MCP tools to use

Current SAP `@ui5/mcp-server` capabilities include:

- `get_project_info`: read project metadata and UI5 configuration.
- `get_version_info`: retrieve UI5 framework version information.
- `get_guidelines`: fetch UI5 coding standards and best practices.
- `get_api_reference`: fetch UI5 API documentation for controls/classes/methods.
- `run_ui5_linter`: run `@ui5/linter` against the app.
- `run_manifest_validation`: validate `webapp/manifest.json`.
- `get_typescript_conversion_guidelines`: guidance for JavaScript-to-TypeScript UI5 work.
- `create_ui5_app`, `create_integration_card`, `get_integration_cards_guidelines`: scaffolding/card-specific work. Use only when the user asks for creation or card work.

## Inputs

Determine these before producing recommendations:

1. **Project root**: required for UI5 MCP project tools.
2. **Current version** (`from_version`): prefer `get_project_info` / `get_version_info`; otherwise read `webapp/manifest.json`, `ui5.yaml`, and `package.json`.
3. **Target version** (`to_version`): ask if absent. Use the full `x.y.z` form.
4. **Library flavor**: use `SAPUI5` if the app depends on commercial libraries such as `sap.ui.comp`, `sap.suite.*`, `sap.fe`, `sap.ui.mdc`, or FLP/ushell; otherwise use `OpenUI5`.
5. **Declared UI5 libraries**: read `sap.ui5.dependencies.libs` and use them to focus feature/fix review.

## Workflow

### 1. Establish scope

Call:

```text
ui5_version_diff(library, from_version, to_version)
```

Summarize `versionsInRange`, `counts`, `totalEntries`, `whatsNewTotalEntries`, and any `meta.notes`. Keep `meta.sourceDataPath` and `meta.generatedAt` for traceability and stale-bundle checks. If the user asks about one release, call `ui5_version_diff(library, version=<x.y.z>)`.

### 2. Get project facts

Call:

```text
get_project_info(projectPath=<project root>)
get_version_info(projectPath=<project root>)
get_guidelines()
```

Use `get_guidelines` once per workflow to anchor coding recommendations. Do not repeatedly fetch broad guidelines inside loops.

### 3. Find deprecations actually used

Call:

```text
ui5_version_diff(library, from_version, to_version, types=["DEPRECATED"])
run_ui5_linter(projectPath=<project root>)
```

Cross-reference diff deprecations with linter findings and code search. Report only confirmed or strongly suspected usage in the app. Skip deprecations that do not match the project.

For confirmed APIs, call:

```text
get_api_reference(name=<control/class/method>)
```

Use this for replacement details. Do not invent replacements from memory.

### 4. Find removable workarounds

Search project comments and code for `TODO`, `FIXME`, `workaround`, BCP/ticket IDs, and symptom words. For each meaningful symptom:

```text
ui5_version_diff(library, from_version, to_version, types=["FIX"], query=<symptom>)
```

If there is a matching fix, cite the entry and commit URL, then verify whether the local workaround can be removed safely.

### 5. Surface relevant features

For each declared UI5 library:

```text
ui5_version_diff(library, from_version, to_version, types=["FEATURE"], ui5_library=<declared lib>)
```

Keep this selective. Mention features that plausibly affect the app's libraries or current code, not every framework feature.

### 6. Validate manifest and rerun after edits

Call:

```text
run_manifest_validation(manifestPath=<project root>/webapp/manifest.json)
run_ui5_linter(projectPath=<project root>)
```

After making fixes, rerun the linter and manifest validation. Treat these tool results as stronger evidence than general release-note text.

## Output

Default to one concise Markdown report:

1. **Scope**: flavor, from/to or single version, versions covered, counts, What's New count, source data path.
2. **Required fixes**: deprecated API, replacement, file:line, evidence.
3. **Workarounds to remove**: local workaround, matching UI5 fix, commit URL.
4. **Relevant features and What's New**: grouped by used UI5 library or product area.
5. **Manifest and linter status**: pass/fail with actionable details.
6. **Edit plan**: concrete changes in order.

Keep raw diff output out of the report. The tool returns all matching entries; if the result is broad, make narrower follow-up calls with `types`, `ui5_library`, or `query`.

## Guardrails

- Prefer exact `x.y.z` versions. If a requested patch is unavailable, `ui5_version_diff` resolves it to the nearest lower available patch with the same major.minor, matching the ui5-lib-diff web app.
- For ranges, use `(from_version, to_version]`. For one release, use `version=<x.y.z>` or pass only one version field.
- If `meta.notes` says the requested release is newer than the local bundle, do not attempt runtime web fetches. Tell the user the setup-time bundle is stale and should be refreshed before relying on that release.
- Do not run scaffolding tools (`create_ui5_app`, `create_integration_card`) unless the user requested creation.
- Do not run project-local UI5 MCP tools without a real project path.
- Do not present every deprecation as required work. The app must use it, or the linter/code search must make it relevant.
- Prefer structured tool results and targeted filtered calls over passing broad intermediate lists through the model.

## Fallbacks

- If SAP `@ui5/mcp-server` is unavailable, proceed with degraded coverage: use `ui5_version_diff`, local file inspection, and `rg` across `webapp/**/*.{js,ts,xml,json}`. Tell the user which UI5 MCP checks were skipped.
- If `ui5_version_diff` reports that the local bundle is missing or stale, refresh the bundle during setup/rebuild with `npm run download:ui5-lib-diff` in the MCP server repo or point `UI5_LIB_DIFF_BUNDLE_PATH` to a local copy.
- If no versions match, check version spelling and patch-level availability before concluding that there were no changes.
