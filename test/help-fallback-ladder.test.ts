/**
 * Unit test for `resolveHelpResults` — the SAP Help version+product relaxation ladder. NO network:
 * the fetcher is injected, so this is deterministic and fast.
 *
 * Guards the fix for the "valid version + invalid product silently drops the version pin" bug. The
 * ladder must:
 *   - relax the PRODUCT scope (a noise filter / likely-wrong slug) BEFORE the VERSION pin (the
 *     caller's explicit release constraint),
 *   - never fetch the same combo twice (dedup when version/product collapse to empty),
 *   - report the version that actually answered (it drives id encoding downstream),
 *   - never go below unscoped-latest, so the leg is never lost.
 *
 * Run with: npm run test:fallback-ladder
 */

import { describe, it, expect } from "vitest";
import { resolveHelpResults } from "../src/lib/sapHelp.js";

const HIT = [{ title: "x" }] as any;

/** Fake fetcher: returns a hit only for the "version|product" combos in `populated`; records calls. */
function makeFetcher(populated: string[]) {
  const calls: string[] = [];
  const set = new Set(populated);
  const fetcher = async (_q: string, v: string, p: string) => {
    calls.push(`${v}|${p}`);
    return set.has(`${v}|${p}`) ? HIT : [];
  };
  return { fetcher, calls };
}

describe("resolveHelpResults relaxation ladder", () => {
  it("no filters → a single unscoped call", async () => {
    const { fetcher, calls } = makeFetcher(["|"]);
    const { results, usedVersion } = await resolveHelpResults(fetcher, "q", "", "");
    expect(results).toHaveLength(1);
    expect(usedVersion).toBe("");
    expect(calls).toEqual(["|"]);
  });

  it("valid version + INVALID product → keeps the version, drops the scope (the bug fix)", async () => {
    // Only (version, unscoped) has docs; the bogus product matches nothing at any version.
    const { fetcher, calls } = makeFetcher(["2025.001|"]);
    const { results, usedVersion } = await resolveHelpResults(fetcher, "q", "2025.001", "BOGUS");
    expect(results).toHaveLength(1);
    expect(usedVersion).toBe("2025.001"); // version pin preserved, NOT reset to latest
    expect(calls).toEqual(["2025.001|BOGUS", "2025.001|"]); // product relaxed before version
  });

  it("invalid version + VALID product → recovers scoped-at-latest", async () => {
    // Nothing at the pinned version; the product is valid at latest.
    const { fetcher, calls } = makeFetcher(["|ABAP_PLATFORM_NEW"]);
    const { results, usedVersion } = await resolveHelpResults(fetcher, "q", "9999", "ABAP_PLATFORM_NEW");
    expect(results).toHaveLength(1);
    expect(usedVersion).toBe(""); // version relaxed (it was empty), scope kept
    expect(calls).toEqual(["9999|ABAP_PLATFORM_NEW", "9999|", "|ABAP_PLATFORM_NEW"]);
  });

  it("invalid version + invalid product → falls all the way to unscoped-latest", async () => {
    const { fetcher, calls } = makeFetcher(["|"]);
    const { results, usedVersion } = await resolveHelpResults(fetcher, "q", "9999", "BOGUS");
    expect(results).toHaveLength(1);
    expect(usedVersion).toBe("");
    expect(calls).toEqual(["9999|BOGUS", "9999|", "|BOGUS", "|"]);
  });

  it("product-only miss → 2 calls, no duplicate fetch", async () => {
    const { fetcher, calls } = makeFetcher(["|"]);
    const { results } = await resolveHelpResults(fetcher, "q", "", "BOGUS");
    expect(results).toHaveLength(1);
    expect(calls).toEqual(["|BOGUS", "|"]); // ("",BOGUS) then ("",""), no ("","") repeat
  });

  it("version-only miss → matches the #52 version→latest contract", async () => {
    const { fetcher, calls } = makeFetcher(["|"]);
    const { results, usedVersion } = await resolveHelpResults(fetcher, "q", "9999", "");
    expect(results).toHaveLength(1);
    expect(usedVersion).toBe("");
    expect(calls).toEqual(["9999|", "|"]); // (V,"") then ("",""), no duplicate
  });

  it("everything empty → returns no results without throwing", async () => {
    const { fetcher } = makeFetcher([]);
    const { results } = await resolveHelpResults(fetcher, "q", "V", "P");
    expect(results).toHaveLength(0);
  });
});
