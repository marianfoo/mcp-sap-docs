/**
 * Tests for the ui5_version_diff filter logic.
 * Pure unit tests against a fixture file — no network calls.
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterUi5Diff,
  compareUi5Versions,
  parseUi5Version,
  normalizeChangeType,
} from "../dist/src/lib/ui5LibDiff/ui5VersionDiff.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    // 1.140: FEATURE(1)
    expect(result.counts).toEqual({ FEATURE: 3, FIX: 1, DEPRECATED: 3 });
    expect(result.totalEntries).toBe(7);
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

  it("respects limit but keeps full counts", () => {
    const result = filterUi5Diff(fixture, {
      from_version: "1.108.0",
      to_version: "1.140.0",
      limit: 2,
    });
    expect(result.entries.length).toBe(2);
    expect(result.totalEntries).toBe(7);
    expect(result.truncated).toBe(true);
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
});
