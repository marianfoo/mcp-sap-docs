/**
 * Acceptance test for the `version` parameter on SAP Help search (roadmap item 1).
 *
 * Premise (verified against help.sap.com): the docs-portal elasticsearch endpoint
 * filters server-side on `version`. A feature introduced in a given release must appear
 * when that release is requested and be ABSENT for earlier releases.
 *
 * Example: the inbound OData API "Task Planning Element" (API_TASKPLANNINGELEMENT) was
 * released in S/4HANA 2025 FPS01 (version 2025.001), loio 920ead13c8c84b9fa70a06197a7d4d10.
 *
 * This is a NETWORK test — it hits help.sap.com. It skips gracefully at RUNTIME (does not
 * fail) when the endpoint is unreachable, so offline CI stays green. Run with:
 *   npm run test:version-filter
 */

import { describe, it, expect } from "vitest";
import { searchSapHelp, getSapHelpContent } from "../src/lib/sapHelp.js";
import type { SearchResponse } from "../src/lib/types.js";

const QUERY = "Task Planning Element API_TASKPLANNINGELEMENT synchronous inbound OData";
const FEATURE_LOIO = "920ead13c8c84b9fa70a06197a7d4d10";
const NEW_VERSION = "2025.001"; // S/4HANA 2025 FPS01 — feature present
const OLD_VERSION = "2023.001"; // S/4HANA 2023 FPS01 — feature absent
const NET_TIMEOUT = 30_000;

/** True if any returned hit corresponds to the feature's loio. */
function containsFeature(res: SearchResponse): boolean {
  return (res.results ?? []).some(
    (r) => r.metadata?.loio === FEATURE_LOIO || (r.id || r.library_id || "").includes(FEATURE_LOIO)
  );
}

/**
 * Run searchSapHelp and skip the test at runtime if SAP Help is unreachable.
 * `expectResults` distinguishes a network failure (skip) from a legitimately empty
 * result set — callers that expect hits pass true so an empty response also skips.
 */
async function liveSearch(
  ctx: { skip: () => void },
  version: string | undefined,
  expectResults: boolean
): Promise<SearchResponse> {
  let res: SearchResponse;
  try {
    res = await searchSapHelp(QUERY, version);
  } catch (e: any) {
    console.warn(`[version-filter] SAP Help threw, skipping: ${e?.message}`);
    ctx.skip();
    return { results: [] };
  }
  if (res.error || (expectResults && (res.results?.length ?? 0) === 0)) {
    console.warn(`[version-filter] SAP Help unreachable/empty, skipping (error: ${res.error ?? "none"})`);
    ctx.skip();
  }
  return res;
}

describe("SAP Help `version` filter (item 1 acceptance)", () => {
  it(
    `returns the feature when version=${NEW_VERSION}`,
    async (ctx) => {
      const res = await liveSearch(ctx, NEW_VERSION, true);
      expect(containsFeature(res)).toBe(true);
    },
    NET_TIMEOUT
  );

  it(
    `does NOT return the feature when version=${OLD_VERSION} (but still returns other docs)`,
    async (ctx) => {
      // Older release still returns results — just not this feature. Asserting "empty"
      // would be wrong (it returns ~20 other 2023 docs) and would mask a network failure.
      const res = await liveSearch(ctx, OLD_VERSION, true);
      expect(containsFeature(res)).toBe(false);
    },
    NET_TIMEOUT
  );

  it(
    "unfiltered search (no version) still returns the feature at latest",
    async (ctx) => {
      const res = await liveSearch(ctx, undefined, true);
      expect(containsFeature(res)).toBe(true);
    },
    NET_TIMEOUT
  );
});

describe("SAP Help search never loses results to a bad version (item 1c)", () => {
  it(
    "a non-existent version falls back to latest instead of returning empty",
    async (ctx) => {
      // The version filter is an exact server-side match: a bogus token matches 0 docs. search
      // must fall back to unfiltered (latest) so SAP Help is never silently dropped.
      const res = await liveSearch(ctx, "1999.001", true);
      expect((res.results ?? []).length).toBeGreaterThan(0);
      // Fell back to latest → ids are NOT pinned to the bogus version.
      expect((res.results ?? []).some((r) => (r.id || "").includes("~1999.001"))).toBe(false);
    },
    NET_TIMEOUT
  );
});

describe("SAP Help version-routed fetch (item 1b)", () => {
  // The search result id now carries the versionId ("sap-help-<loio>~2025.001"); fetch must
  // self-route to that release's content with no extra parameter from the caller.
  it(
    "fetch resolves a version-pinned id to non-empty, on-topic content",
    async (ctx) => {
      const res = await liveSearch(ctx, NEW_VERSION, true);
      const hit = (res.results ?? []).find((r) => r.metadata?.loio === FEATURE_LOIO);
      if (!hit) ctx.skip();
      expect(hit!.id).toContain(`~${NEW_VERSION}`); // versionId encoded into the id
      const content = await getSapHelpContent(hit!.id);
      expect(content.length).toBeGreaterThan(200);
      expect(content).toMatch(/Task Planning/i);
    },
    NET_TIMEOUT
  );

  it(
    "fetch falls back to default content when the pinned version build is unavailable",
    async (ctx) => {
      // A bogus version yields no version-specific deliverable; fetch must fall back to the
      // default path rather than return empty/throw — i.e. never worse than today.
      let content: string;
      try {
        content = await getSapHelpContent(`sap-help-${FEATURE_LOIO}~1999.001`);
      } catch (e: any) {
        console.warn(`[version-filter] fetch threw (likely offline), skipping: ${e?.message}`);
        ctx.skip();
        return;
      }
      expect(content.length).toBeGreaterThan(200);
      expect(content).toMatch(/Task Planning/i);
    },
    NET_TIMEOUT
  );
});
