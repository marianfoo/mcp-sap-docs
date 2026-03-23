/**
 * Sparse-checkout integrity tests.
 *
 * These tests verify two things:
 *  1. Every source directory that build-index.ts reads from is present and non-empty
 *     (guards against accidentally over-narrowing a sparse path).
 *  2. When sparse checkout IS configured for a submodule, directories outside the
 *     sparse paths must be absent from the working tree (confirms disk savings).
 *
 * Negative assertions (group 2) are SKIPPED when git reports that sparse checkout
 * is not yet active for a repo, so the tests are safe to run against a fresh clone
 * that hasn't been through the updated setup.sh yet.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "fs";
import { execSync } from "child_process";
import path from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True if the directory exists and contains at least one entry. */
function dirHasFiles(dirPath: string): boolean {
  try {
    return existsSync(dirPath) && readdirSync(dirPath).length > 0;
  } catch {
    return false;
  }
}

/**
 * Returns the list of paths reported by `git sparse-checkout list` for a
 * submodule, or an empty array when sparse checkout is not configured.
 */
function getSparseList(submodulePath: string): string[] {
  try {
    const out = execSync(`git -C "${submodulePath}" sparse-checkout list 2>/dev/null`, {
      encoding: "utf8",
    }).trim();
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Positive assertions: every indexed source directory must exist with files
// Mirrors the absDir values in scripts/build-index.ts
// ---------------------------------------------------------------------------

const REQUIRED_SOURCE_DIRS: Array<{ label: string; dir: string }> = [
  { label: "sapui5 docs",                     dir: "sources/sapui5-docs/docs" },
  { label: "openui5 src (API + samples)",     dir: "sources/openui5/src" },
  { label: "cap docs",                        dir: "sources/cap-docs" },
  { label: "wdi5 docs",                       dir: "sources/wdi5/docs" },
  { label: "ui5-tooling docs",                dir: "sources/ui5-tooling/docs" },
  { label: "cloud-mta-build-tool docs",       dir: "sources/cloud-mta-build-tool/docs/docs" },
  { label: "ui5-webcomponents docs",          dir: "sources/ui5-webcomponents/docs" },
  { label: "cloud-sdk docs-js",               dir: "sources/cloud-sdk/docs-js" },
  { label: "cloud-sdk docs-java",             dir: "sources/cloud-sdk/docs-java" },
  { label: "cloud-sdk-ai docs-js",            dir: "sources/cloud-sdk-ai/docs-js" },
  { label: "cloud-sdk-ai docs-java",          dir: "sources/cloud-sdk-ai/docs-java" },
  { label: "ui5-typescript root",             dir: "sources/ui5-typescript" },
  { label: "ui5-cc-spreadsheetimporter docs", dir: "sources/ui5-cc-spreadsheetimporter/docs" },
  { label: "abap-cheat-sheets root",          dir: "sources/abap-cheat-sheets" },
  { label: "sap-styleguides root",            dir: "sources/sap-styleguides" },
  { label: "dsag-abap-leitfaden docs",        dir: "sources/dsag-abap-leitfaden/docs" },
  { label: "abap-fiori-showcase root",        dir: "sources/abap-fiori-showcase" },
  { label: "cap-fiori-showcase root",         dir: "sources/cap-fiori-showcase" },
  { label: "abap-docs standard",              dir: "sources/abap-docs/docs/standard/md" },
  { label: "abap-docs cloud",                 dir: "sources/abap-docs/docs/cloud/md" },
  { label: "abap-platform-rap-opensap root",  dir: "sources/abap-platform-rap-opensap" },
  { label: "cloud-abap-rap root",             dir: "sources/cloud-abap-rap" },
  { label: "abap-platform-reuse-services root", dir: "sources/abap-platform-reuse-services" },
  { label: "btp-cloud-platform docs",         dir: "sources/btp-cloud-platform/docs" },
  { label: "sap-artificial-intelligence docs", dir: "sources/sap-artificial-intelligence/docs" },
  // sapReleasedObjects uses sources/abap-atc-cr-cv-s4hc/src
  { label: "abap-atc-cr-cv-s4hc src",         dir: "sources/abap-atc-cr-cv-s4hc/src" },
];

describe("sparse checkout - source directories are intact", () => {
  for (const { label, dir } of REQUIRED_SOURCE_DIRS) {
    it(`${label} (${dir}) exists and has files`, () => {
      expect(
        dirHasFiles(dir),
        `Expected "${dir}" to exist and contain files. ` +
          `If this is a new source, add its sparse path to setup.sh get_sparse_paths().`
      ).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Negative assertions: directories OUTSIDE the sparse set must be absent.
// Only run when git confirms sparse checkout is active for the submodule.
// ---------------------------------------------------------------------------

interface ExclusionCheck {
  submodule: string;          // path to submodule (git -C target)
  sparseDirs: string[];       // dirs that SHOULD be present
  excludedDirs: string[];     // dirs that must NOT be present after sparse checkout
}

const EXCLUSION_CHECKS: ExclusionCheck[] = [
  {
    submodule: "sources/openui5",
    sparseDirs: ["src"],
    // openui5 root has: grunt/ lib/ docs/ plus src/  — only src/ is needed
    excludedDirs: ["grunt", "lib"],
  },
  {
    submodule: "sources/sapui5-docs",
    sparseDirs: ["docs"],
    // sapui5-docs root has: viewer/ scripts/ plus docs/
    excludedDirs: ["viewer", "scripts"],
  },
  {
    submodule: "sources/cloud-sdk",
    sparseDirs: ["docs-js", "docs-java"],
    // cloud-sdk root has: src/ static/ styles/ docs-js_versioned_docs/ etc.
    excludedDirs: ["src", "static", "docs-js_versioned_docs", "docs-java_versioned_docs"],
  },
  {
    submodule: "sources/ui5-webcomponents",
    sparseDirs: ["docs"],
    // ui5-webcomponents root has: packages/ patches/ etc.
    excludedDirs: ["packages", "patches"],
  },
  {
    submodule: "sources/abap-docs",
    sparseDirs: ["docs"],
    // abap-docs root should only have docs/ after sparse checkout
    // (check that no unexpected sibling dirs leaked in)
    excludedDirs: [],  // repo root structure varies; keep empty, only sparse presence checked
  },
  {
    submodule: "sources/abap-atc-cr-cv-s4hc",
    sparseDirs: ["src"],
    excludedDirs: ["test"],
  },
];

describe("sparse checkout - excluded directories are absent", () => {
  for (const { submodule, sparseDirs, excludedDirs } of EXCLUSION_CHECKS) {
    const sparseList = getSparseList(submodule);
    const isSparseActive = sparseList.length > 0;

    if (!isSparseActive) {
      it.skip(`${submodule}: sparse checkout not yet configured (run setup.sh to apply)`, () => {});
      continue;
    }

    // Verify the sparse paths we expect are actually configured
    it(`${submodule}: git reports sparse paths include ${sparseDirs.join(", ")}`, () => {
      for (const sp of sparseDirs) {
        expect(
          sparseList.some((p) => p === sp || p.startsWith(sp + "/")),
          `Expected "${sp}" in sparse-checkout list for ${submodule}. Got: ${sparseList.join(", ")}`
        ).toBe(true);
      }
    });

    // Verify the sparse dirs are actually present
    for (const sp of sparseDirs) {
      const fullPath = path.join(submodule, sp);
      it(`${submodule}/${sp} is present after sparse checkout`, () => {
        expect(dirHasFiles(fullPath)).toBe(true);
      });
    }

    // Verify excluded dirs are absent
    for (const ex of excludedDirs) {
      const fullPath = path.join(submodule, ex);
      it(`${submodule}/${ex} is absent (outside sparse paths)`, () => {
        expect(
          existsSync(fullPath),
          `"${fullPath}" should not exist after sparse checkout to [${sparseDirs.join(", ")}]`
        ).toBe(false);
      });
    }
  }
});
