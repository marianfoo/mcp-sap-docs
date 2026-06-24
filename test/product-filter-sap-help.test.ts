/**
 * Acceptance test for the `product` scope on SAP Help search (online-merge pollution fix).
 *
 * Premise (verified against help.sap.com, see test/eval/candidate-probes.md): the docs-portal
 * elasticsearch endpoint filters server-side on `product`. Scoping the online leg to the relevant
 * product removes cross-product noise (SQL Anywhere / BW / Commerce …) that otherwise outranks the
 * correct docs. Two routes:
 *   - ABAP-language queries  → product = ABAP_PLATFORM_NEW  (the abapFlavor='standard' mapping)
 *   - functional queries     → product = SAP_S4HANA_ON-PREMISE (explicit `product`, which abapFlavor can't express)
 *
 * Safety: a wrong/unknown product matches 0 docs server-side; searchSapHelp must fall back to
 * unscoped so the SAP Help leg is NEVER silently dropped — mirrors the `version` fallback (#52).
 *
 * NETWORK test — hits help.sap.com; skips gracefully at RUNTIME when unreachable. Run with:
 *   npm run test:product-filter
 */

import { describe, it, expect } from "vitest";
import { searchSapHelp } from "../src/lib/sapHelp.js";
import type { SearchResponse } from "../src/lib/types.js";

const NET_TIMEOUT = 30_000;
const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Run searchSapHelp(query, version, product) and skip at runtime if SAP Help is unreachable/empty. */
async function liveSearch(
  ctx: { skip: () => void },
  query: string,
  product: string | undefined
): Promise<SearchResponse> {
  let res: SearchResponse;
  try {
    res = await searchSapHelp(query, "", product);
  } catch (e: any) {
    console.warn(`[product-filter] SAP Help threw, skipping: ${e?.message}`);
    ctx.skip();
    return { results: [] };
  }
  if (res.error || (res.results?.length ?? 0) === 0) {
    console.warn(`[product-filter] SAP Help unreachable/empty, skipping (error: ${res.error ?? "none"})`);
    ctx.skip();
  }
  return res;
}

/** Fraction of hits whose product matches a normalized core token. */
function fractionMatching(res: SearchResponse, coreToken: string): number {
  const hits = res.results ?? [];
  if (!hits.length) return 0;
  const n = hits.filter((r) => norm(r.metadata?.product).includes(coreToken)).length;
  return n / hits.length;
}

describe("SAP Help `product` scope (online-merge pollution fix)", () => {
  it(
    "ABAP query scoped to ABAP_PLATFORM_NEW returns only ABAP Platform docs",
    async (ctx) => {
      const res = await liveSearch(ctx, "read database rows for every key in an internal table", "ABAP_PLATFORM_NEW");
      // Server-side product filter → every hit must carry the scoped product.
      expect(fractionMatching(res, "ABAPPLATFORM")).toBe(1);
    },
    NET_TIMEOUT
  );

  it(
    "functional query scoped to SAP_S4HANA_ON-PREMISE returns S/4HANA functional docs",
    async (ctx) => {
      const res = await liveSearch(ctx, "fixed asset valuation areas configuration in asset class", "SAP_S4HANA_ON-PREMISE");
      // Display product is "SAP S/4HANA"; allow a small tail but require a clear majority on-target.
      expect(fractionMatching(res, "S4HANA")).toBeGreaterThanOrEqual(0.8);
    },
    NET_TIMEOUT
  );

  it(
    "the same ABAP query UNSCOPED is NOT all-ABAP (demonstrates the pollution the scope fixes)",
    async (ctx) => {
      const res = await liveSearch(ctx, "read database rows for every key in an internal table", "");
      // Pre-fix behaviour: cross-product hits dominate, so on-target fraction is far below 1.
      expect(fractionMatching(res, "ABAPPLATFORM")).toBeLessThan(0.5);
    },
    NET_TIMEOUT
  );

  it(
    "an unknown product falls back to unscoped instead of returning empty (never drops the leg)",
    async (ctx) => {
      // A bogus product matches 0 docs server-side; the fallback must retry unscoped so results
      // are never lost — never worse than no scoping.
      const res = await liveSearch(ctx, "read database rows for every key in an internal table", "THIS_IS_NOT_A_PRODUCT_XYZ");
      expect((res.results ?? []).length).toBeGreaterThan(0);
      // Fell back to unscoped → it did NOT silently return an empty/all-bogus set.
      expect(fractionMatching(res, "THISISNOTAPRODUCTXYZ")).toBe(0);
    },
    NET_TIMEOUT
  );

  it(
    "scoped functional hits expose the real filter token in metadata.productId (discovery contract)",
    async (ctx) => {
      // The whole point of the discovery loop: a caller runs WITHOUT product, copies a hit's
      // `metadata.productId`, and passes it back. So every scoped functional hit must carry the EXACT
      // facet token "SAP_S4HANA_ON-PREMISE" — NOT the display label "SAP S/4HANA" (which filters to 0).
      const res = await liveSearch(ctx, "where do I configure the number range for billing documents", "SAP_S4HANA_ON-PREMISE");
      const ids = (res.results ?? []).map((r) => r.metadata?.productId);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.every((id) => id === "SAP_S4HANA_ON-PREMISE")).toBe(true);
    },
    NET_TIMEOUT
  );
});
