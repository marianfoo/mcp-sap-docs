/**
 * Tests for the ui5_version_diff filter logic.
 * Pure unit tests against a fixture file — no network calls.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../dist/src/lib/config.js";
import {
  filterUi5Diff,
  compareUi5Versions,
  parseUi5Version,
  normalizeChangeType,
  optionalString,
  getUi5VersionDiff,
  clearUi5LibDiffCachesForTests,
  type Ui5VersionDiffResult,
} from "../dist/src/lib/ui5LibDiff/ui5VersionDiff.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const originalFetch = globalThis.fetch;
const originalBundlePath = CONFIG.UI5_LIB_DIFF_BUNDLE_PATH;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  CONFIG.UI5_LIB_DIFF_BUNDLE_PATH = originalBundlePath;
  clearUi5LibDiffCachesForTests();
});

function writeBundle(
  bundlePath: string,
  fixture: any[],
  generatedAt = "2026-05-20T00:00:00.000Z"
): void {
  fs.writeFileSync(
    bundlePath,
    JSON.stringify({
      schemaVersion: 1,
      generatedAt,
      datasets: {
        SAPUI5: fixture,
        OpenUI5: fixture,
      },
      whatsNew: [
        {
          id: 1,
          Version: "1.130",
          Title: "<span>sap.m.ObjectStatus</span>",
          Description: "ObjectStatus now supports emptyIndicatorMode.",
          Type: "Changed",
          Action: "Info Only",
          Category: "Control",
          Valid_as_Of: "2024-09-12",
          outputloio: "abc123",
        },
        {
          id: 2,
          Version: "1.140",
          Title: "sap.m.Button",
          Description: "Badge support.",
          Type: "New",
          Category: "Control",
        },
      ],
    }),
    "utf-8"
  );
}

function writeBundleFixture(fixtureText: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ui5-lib-diff-"));
  const bundlePath = path.join(tmpDir, "all-changes.json");
  const fixture = JSON.parse(fixtureText);
  writeBundle(bundlePath, fixture);
  return bundlePath;
}

/** Mirrors ui5_version_diff outputSchema string fields that must not be null. */
function assertNoNullOptionalStrings(result: Ui5VersionDiffResult): void {
  for (const entry of result.entries) {
    for (const key of ["date", "commit_url"] as const) {
      const value = entry[key];
      expect(value).not.toBeNull();
      if (value !== undefined) {
        expect(typeof value).toBe("string");
        expect(value).not.toBe("");
      }
    }
  }
  for (const entry of result.whatsNewEntries) {
    for (const key of ["type", "action", "category", "validAsOf", "url"] as const) {
      const value = entry[key];
      expect(value).not.toBeNull();
      if (value !== undefined) {
        expect(typeof value).toBe("string");
        expect(value).not.toBe("");
      }
    }
  }
}

describe("optionalString", () => {
  it("returns trimmed non-empty strings and drops null, undefined, and empty values", () => {
    expect(optionalString(" https://example.com/commit ")).toBe(
      "https://example.com/commit"
    );
    expect(optionalString(null)).toBeUndefined();
    expect(optionalString(undefined)).toBeUndefined();
    expect(optionalString("")).toBeUndefined();
    expect(optionalString("   ")).toBeUndefined();
    expect(optionalString(123)).toBeUndefined();
  });
});

describe("compareUi5Versions", () => {
  it("orders versions numerically, not lexicographically", () => {
    expect(compareUi5Versions("1.100.0", "1.99.0")).toBeGreaterThan(0);
    expect(compareUi5Versions("1.108.0", "1.108.0")).toBe(0);
    expect(compareUi5Versions("1.108.0", "1.108.1")).toBeLessThan(0);
    expect(compareUi5Versions("1.140.0", "1.99.0")).toBeGreaterThan(0);
  });

  it("tolerates short versions and v-prefix", () => {
    expect(compareUi5Versions("1.120", "1.120.0")).toBe(0);
    expect(compareUi5Versions("v1.130.0", "1.130.0")).toBe(0);
  });
});

describe("parseUi5Version", () => {
  it("parses three-segment versions", () => {
    expect(parseUi5Version("1.108.0")).toEqual([1, 108, 0]);
    expect(parseUi5Version("1.142.11")).toEqual([1, 142, 11]);
  });

  it("defaults missing segments to zero", () => {
    expect(parseUi5Version("1.120")).toEqual([1, 120, 0]);
    expect(parseUi5Version("1")).toEqual([1, 0, 0]);
  });
});

describe("normalizeChangeType", () => {
  it("returns canonical input unchanged (fast path matches upstream-normalized data)", () => {
    expect(normalizeChangeType("FEATURE")).toBe("FEATURE");
    expect(normalizeChangeType("FIX")).toBe("FIX");
    expect(normalizeChangeType("DEPRECATED")).toBe("DEPRECATED");
  });

  it("still tolerates casing variants from stale data files (defensive fallback)", () => {
    // Once the upstream PR (marianfoo/ui5-lib-diff parseChanges.js normalization)
    // is deployed and a refresh cycle has run, these variants no longer appear
    // in the data. We keep the path as a safety net for stale on-disk caches
    // produced before the upstream landed.
    expect(normalizeChangeType("Feature")).toBe("FEATURE");
    expect(normalizeChangeType("feature")).toBe("FEATURE");
    expect(normalizeChangeType("Fix")).toBe("FIX");
  });

  it("drops internal/legacy markers", () => {
    expect(normalizeChangeType("INTERNAL")).toBeNull();
    expect(normalizeChangeType("INETRNAL")).toBeNull();
    expect(normalizeChangeType("LEGACY")).toBeNull();
    expect(normalizeChangeType("[INTERNAL] ALP")).toBeNull();
  });
});

describe("filterUi5Diff", () => {
  let fixture: any[];

  beforeAll(() => {
    const fixturePath = path.join(__dirname, "fixtures", "ui5-lib-diff-sample.json");
    fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  });

  it("includes changes after from_version and up to to_version (inclusive)", () => {
    const result = filterUi5Diff(fixture, {
      from_version: "1.108.0",
      to_version: "1.130.0",
    });

    // 1.108.0 is excluded (the version you're leaving), 1.140.0 is outside the range.
    // 1.120: sap.m FEATURE+FIX (2) + sap.ui.core DEPRECATED (1) = 3
    // 1.130: sap.m FEATURE+DEPRECATED (2) + deprecated-lib DEPRECATED (1) = 3 (LEGACY dropped)
    expect(result.versionsInRange).toEqual(["1.130.0", "1.120.0"]);
    expect(result.totalEntries).toBe(6);
  });

  it("counts FEATURE / FIX / DEPRECATED across the range, dropping internal noise", () => {
    const result = filterUi5Diff(fixture, {
      from_version: "1.108.0",
      to_version: "1.140.0",
    });
    // 1.120: FEATURE(1) + FIX(1) + DEPRECATED(1) = 3
    // 1.130: FEATURE(1) + DEPRECATED(2) = 3 (LEGACY dropped)
    // 1.140: FEATURE(1) + FIX(1)
    expect(result.counts).toEqual({ FEATURE: 3, FIX: 2, DEPRECATED: 3 });
    expect(result.totalEntries).toBe(8);
  });

  it("filters by type", () => {
    const result = filterUi5Diff(fixture, {
      from_version: "1.108.0",
      to_version: "1.140.0",
      types: ["DEPRECATED"],
    });
    expect(result.entries.every((e) => e.type === "DEPRECATED")).toBe(true);
    expect(result.counts.DEPRECATED).toBe(3);
    expect(result.counts.FEATURE).toBe(0);
    expect(result.counts.FIX).toBe(0);
  });

  it("filters by ui5_library substring (case-insensitive)", () => {
    const result = filterUi5Diff(fixture, {
      from_version: "1.108.0",
      to_version: "1.140.0",
      ui5_library: "SAP.M",
    });
    expect(result.entries.every((e) => e.library === "sap.m")).toBe(true);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it("filters by query substring (case-insensitive)", () => {
    const result = filterUi5Diff(fixture, {
      from_version: "1.108.0",
      to_version: "1.140.0",
      query: "objectstatus",
    });
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].text).toContain("ObjectStatus");
  });

  it("rejects empty/invalid range when from > to (called via getUi5VersionDiff)", () => {
    // filterUi5Diff itself is pure; out-of-order ranges simply yield no matches.
    const result = filterUi5Diff(fixture, {
      from_version: "1.130.0",
      to_version: "1.108.0",
    });
    expect(result.totalEntries).toBe(0);
    expect(result.versionsInRange.length).toBe(0);
  });

  it("returns all matching entries without applying a tool-level limit", () => {
    const result = filterUi5Diff(fixture, {
      from_version: "1.108.0",
      to_version: "1.140.0",
    });
    expect(result.entries.length).toBe(8);
    expect(result.totalEntries).toBe(8);
    expect("truncated" in result).toBe(false);
  });

  it("populates meta with dataset bounds regardless of range", () => {
    const result = filterUi5Diff(fixture, {
      from_version: "1.120.0",
      to_version: "1.130.0",
    });
    expect(result.meta.availableVersions).toBe(fixture.length);
    expect(result.meta.minVersion).toBe("1.108.0");
    expect(result.meta.maxVersion).toBe("1.140.0");
  });

  it("includes the synthetic 'deprecated' pseudo-library entries", () => {
    const result = filterUi5Diff(fixture, {
      from_version: "1.120.0",
      to_version: "1.130.0",
      types: ["DEPRECATED"],
    });
    const libs = result.entries.map((e) => e.library);
    expect(libs).toContain("deprecated");
  });

  it("coerces a malformed types argument and records a note", () => {
    const result = filterUi5Diff(fixture, {
      from_version: "1.108.0",
      to_version: "1.140.0",
      // Bad client: sends a string instead of an array.
      types: "FEATURE" as any,
    });
    // Defensive coercion falls back to all three types, doesn't crash, doesn't
    // accidentally match nothing (which is what `new Set("FEATURE")` would do).
    expect(result.totalEntries).toBe(8);
  });

  it("omits commit_url when the bundle stores null", () => {
    const result = filterUi5Diff(fixture, {
      version: "1.140.0",
      types: ["FIX"],
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual({
      version: "1.140.0",
      date: "2025.04.10",
      library: "sap.m",
      type: "FIX",
      text: "sap.fe.controls: AI notice at column level",
    });
    expect(result.entries[0]).not.toHaveProperty("commit_url");
    assertNoNullOptionalStrings(result);
  });

  it("omits optional What's New string fields when absent", () => {
    const result = filterUi5Diff(
      fixture,
      { version: "1.140.0" },
      [
        {
          id: 2,
          Version: "1.140",
          Title: "sap.m.Button",
          Description: "Badge support.",
          Type: null,
          Action: null,
          Category: "Control",
          Valid_as_Of: null,
          outputloio: null,
        },
      ]
    );

    expect(result.whatsNewEntries).toEqual([
      {
        version: "1.140",
        title: "sap.m.Button",
        description: "Badge support.",
        category: "Control",
        id: 2,
      },
    ]);
    assertNoNullOptionalStrings(result);
  });

  it("emits notes when to_version exceeds dataset bounds", () => {
    const result = filterUi5Diff(fixture, {
      from_version: "1.108.0",
      to_version: "1.200.0", // beyond fixture's 1.140.0
    });
    expect(result.meta.notes ?? []).toEqual(
      expect.arrayContaining([
        expect.stringContaining("newer than the newest version in the local bundle"),
        expect.stringContaining("will not fetch newer data"),
      ])
    );
  });

  it("emits notes when the range matched zero versions", () => {
    const result = filterUi5Diff(fixture, {
      from_version: "1.140.0",
      to_version: "1.141.0", // no entries in this gap
    });
    expect(result.versionsInRange).toEqual([]);
    expect(result.meta.notes ?? []).toEqual(
      expect.arrayContaining([
        expect.stringContaining("No versions matched"),
      ])
    );
  });

  it("resolves unavailable patch versions to the nearest lower available patch", () => {
    const result = filterUi5Diff(fixture, {
      from_version: "1.120.5",
      to_version: "1.130.9",
      types: ["DEPRECATED"],
    });

    expect(result.from_version).toBe("1.120.0");
    expect(result.to_version).toBe("1.130.0");
    expect(result.meta.notes ?? []).toEqual(
      expect.arrayContaining([
        expect.stringContaining("from_version 1.120.5 is not available"),
        expect.stringContaining("to_version 1.130.9 is not available"),
      ])
    );
  });

  it("supports single-version requests", () => {
    const result = filterUi5Diff(fixture, {
      version: "1.130.0",
    });

    expect(result.mode).toBe("version");
    expect(result.version).toBe("1.130.0");
    expect(result.versionsInRange).toEqual(["1.130.0"]);
    expect(result.totalEntries).toBe(3);
  });

  it("always includes What's New entries for the same range", () => {
    const result = filterUi5Diff(
      fixture,
      {
        from_version: "1.120.0",
        to_version: "1.130.0",
        query: "ObjectStatus",
      },
      [
        {
          id: 1,
          Version: "1.130",
          Title: "<span>sap.m.ObjectStatus</span>",
          Description: "ObjectStatus now supports emptyIndicatorMode.",
          Type: "Changed",
          Category: "Control",
        },
        {
          id: 2,
          Version: "1.140",
          Title: "sap.m.Button",
          Description: "Badge support.",
          Type: "New",
          Category: "Control",
        },
      ]
    );

    expect(result.whatsNewTotalEntries).toBe(1);
    expect(result.whatsNewEntries).toEqual([
      expect.objectContaining({
        version: "1.130",
        title: "sap.m.ObjectStatus",
        description: "ObjectStatus now supports emptyIndicatorMode.",
        type: "Changed",
        category: "Control",
      }),
    ]);
    expect(result.whatsNewEntries[0]).not.toHaveProperty("action");
    expect(result.whatsNewEntries[0]).not.toHaveProperty("url");
  });
});

describe("getUi5VersionDiff input validation", () => {
  it("treats from_version === to_version as a single-version request", async () => {
    const fixturePath = path.join(__dirname, "fixtures", "ui5-lib-diff-sample.json");
    const fixture = fs.readFileSync(fixturePath, "utf-8");
    const bundlePath = writeBundleFixture(fixture);
    CONFIG.UI5_LIB_DIFF_BUNDLE_PATH = bundlePath;

    const result = await getUi5VersionDiff({
      from_version: "1.130.0",
      to_version: "1.130.0",
    });

    expect(result.mode).toBe("version");
    expect(result.version).toBe("1.130.0");
  });

  it("rejects from_version > to_version", async () => {
    await expect(
      getUi5VersionDiff({ from_version: "1.140.0", to_version: "1.108.0" })
    ).rejects.toThrow(/less than or equal/);
  });

  it("accepts a single to_version as single-version mode", async () => {
    const fixturePath = path.join(__dirname, "fixtures", "ui5-lib-diff-sample.json");
    const fixture = fs.readFileSync(fixturePath, "utf-8");
    const bundlePath = writeBundleFixture(fixture);
    CONFIG.UI5_LIB_DIFF_BUNDLE_PATH = bundlePath;

    const result = await getUi5VersionDiff({ to_version: "1.130.0" });
    expect(result.mode).toBe("version");
    expect(result.version).toBe("1.130.0");
  });

  it("rejects completely missing parameters", async () => {
    await expect(
      getUi5VersionDiff({})
    ).rejects.toThrow(/requires either version/);
  });

  it("reads the local all-changes bundle and reports metadata", async () => {
    const fixturePath = path.join(__dirname, "fixtures", "ui5-lib-diff-sample.json");
    const fixture = fs.readFileSync(fixturePath, "utf-8");
    const bundlePath = writeBundleFixture(fixture);
    CONFIG.UI5_LIB_DIFF_BUNDLE_PATH = bundlePath;

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;

    const result = await getUi5VersionDiff({
      library: "SAPUI5",
      from_version: "1.108.0",
      to_version: "1.130.0",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.meta.sourceDataPath).toBe(bundlePath);
    expect(result.meta.cacheSource).toBe("disk");
    expect(result.meta.generatedAt).toBe("2026-05-20T00:00:00.000Z");
    expect(result.whatsNewEntries?.length).toBe(1);
    expect(result.sourceUrl).toBe(
      "https://ui5-lib-diff.marianzeis.de/?versionFrom=1.108.0&versionTo=1.130.0&ui5Type=SAPUI5"
    );
  });

  it("uses one cached local bundle for both SAPUI5 and OpenUI5", async () => {
    const fixturePath = path.join(__dirname, "fixtures", "ui5-lib-diff-sample.json");
    const fixture = fs.readFileSync(fixturePath, "utf-8");
    const bundlePath = writeBundleFixture(fixture);
    CONFIG.UI5_LIB_DIFF_BUNDLE_PATH = bundlePath;

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;

    await getUi5VersionDiff({
      library: "SAPUI5",
      from_version: "1.108.0",
      to_version: "1.130.0",
    });
    fs.unlinkSync(bundlePath);

    const result = await getUi5VersionDiff({
      library: "OpenUI5",
      from_version: "1.108.0",
      to_version: "1.130.0",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.library).toBe("OpenUI5");
    expect(result.meta.sourceDataPath).toBe(bundlePath);
    expect(result.meta.cacheSource).toBe("disk");
    expect(result.meta.generatedAt).toBe("2026-05-20T00:00:00.000Z");
  });

  it("refreshes from the local file when the in-memory bundle is missing a requested version", async () => {
    const fixturePath = path.join(__dirname, "fixtures", "ui5-lib-diff-sample.json");
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ui5-lib-diff-refresh-"));
    const bundlePath = path.join(tmpDir, "all-changes.json");
    CONFIG.UI5_LIB_DIFF_BUNDLE_PATH = bundlePath;

    writeBundle(bundlePath, fixture.slice(0, 3), "2026-05-19T00:00:00.000Z");
    await getUi5VersionDiff({ version: "1.130.0" });

    writeBundle(bundlePath, fixture, "2026-05-20T00:00:00.000Z");
    const result = await getUi5VersionDiff({ version: "1.140.0" });

    expect(result.version).toBe("1.140.0");
    expect(result.totalEntries).toBe(2);
    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ version: "1.140.0", text: "sap.m.Button: badge support" }),
        expect.objectContaining({
          version: "1.140.0",
          text: "sap.fe.controls: AI notice at column level",
        }),
      ])
    );
    expect(result.meta.generatedAt).toBe("2026-05-20T00:00:00.000Z");
  });

  it("returns MCP-safe output for a real bundle version with null commit_url values", async () => {
    const bundlePath = path.join(
      __dirname,
      "..",
      "dist",
      "data",
      "ui5-lib-diff",
      "all-changes.json"
    );
    if (!fs.existsSync(bundlePath)) {
      return;
    }

    CONFIG.UI5_LIB_DIFF_BUNDLE_PATH = bundlePath;
    const result = await getUi5VersionDiff({
      library: "SAPUI5",
      version: "1.147.0",
    });

    expect(result.totalEntries).toBeGreaterThan(0);
    expect(result.whatsNewTotalEntries).toBeGreaterThanOrEqual(0);
    assertNoNullOptionalStrings(result);
    expect(
      result.entries.some((entry) => !("commit_url" in entry))
    ).toBe(true);
  });

  it("fails clearly when the local bundle is missing", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ui5-lib-diff-missing-"));
    CONFIG.UI5_LIB_DIFF_BUNDLE_PATH = path.join(tmpDir, "all-changes.json");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;

    await expect(
      getUi5VersionDiff({
        library: "SAPUI5",
        from_version: "1.108.0",
        to_version: "1.130.0",
      })
    ).rejects.toThrow(/local bundle unavailable/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
