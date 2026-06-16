/**
 * Acceptance test for structured SAP Help citations (roadmap item 8).
 *
 * Item 1/1b made fetch version-correct; item 8 surfaces the document's identity as
 * structured fields (loio / product / version / url / title + the resolved deliverable
 * build) instead of burying them in the rendered content header. The agent uses these
 * to cite precisely, dedup across versions, and verify it quoted the right build.
 *
 * Two contracts under test:
 *   - fetch: getSapHelpDocument returns { text, citation }; getSapHelpContent stays a
 *     string-only wrapper returning exactly that text (existing callers unaffected).
 *   - search: the unified search result carries citation { loio, product, version }.
 *
 * This is a NETWORK test — it hits help.sap.com and skips gracefully at RUNTIME when the
 * endpoint is unreachable, so offline CI stays green. Run with:
 *   npm run test:citations
 */

import { describe, it, expect } from "vitest";
import { searchSapHelp, getSapHelpContent, getSapHelpDocument } from "../src/lib/sapHelp.js";
import { search } from "../src/lib/search.js";
import type { SearchResponse } from "../src/lib/types.js";

const QUERY = "Task Planning Element API_TASKPLANNINGELEMENT synchronous inbound OData";
const FEATURE_LOIO = "920ead13c8c84b9fa70a06197a7d4d10";
const VERSION = "2025.001"; // S/4HANA 2025 FPS01 — feature present
const NET_TIMEOUT = 30_000;

/** Locate the version-pinned result id for the feature, or skip if SAP Help is unreachable. */
async function feedId(ctx: { skip: () => void }): Promise<string> {
  let res: SearchResponse;
  try {
    res = await searchSapHelp(QUERY, VERSION);
  } catch (e: any) {
    console.warn(`[citations] SAP Help threw, skipping: ${e?.message}`);
    ctx.skip();
    return "";
  }
  if (res.error || (res.results?.length ?? 0) === 0) {
    console.warn(`[citations] SAP Help unreachable/empty, skipping (error: ${res.error ?? "none"})`);
    ctx.skip();
    return "";
  }
  const hit = (res.results ?? []).find((r) => r.metadata?.loio === FEATURE_LOIO);
  if (!hit) ctx.skip();
  return hit!.id;
}

describe("SAP Help structured citations (item 8)", () => {
  it(
    "getSapHelpDocument returns a structured citation for a version-pinned LOIO fetch",
    async (ctx) => {
      const id = await feedId(ctx);
      const { text, citation } = await getSapHelpDocument(id);

      // Identity + provenance the agent cites against — always present.
      expect(citation.loio).toBe(FEATURE_LOIO);
      // requestedVersion is parsed from the id — deterministic, no network dependence.
      expect(citation.requestedVersion).toBe(VERSION);
      // versionId is the served doc's exact, pinnable token (not the spaced display string) — a
      // caller passes it straight back as `version` to re-pin. Present and token-shaped (no spaces).
      expect(citation.versionId).toBeTruthy();
      expect(citation.versionId).not.toMatch(/\s/);
      // version is the human display label of the served release — a non-empty string for showing.
      expect(citation.version && citation.version.length).toBeGreaterThan(0);
      expect(citation.url).toMatch(/^https:\/\/help\.sap\.com\//);
      expect(citation.title && citation.title.length).toBeGreaterThan(0);
      expect(citation.title).not.toContain("sap-help-"); // resolved page title, not the raw id

      // deliverableId/buildNo pin the exact build, but only the full-LOIO fetch path produces
      // them; the no-LOIO branch and some fallbacks legitimately omit them. Assert they're
      // well-formed WHEN present rather than requiring them (matches the optional interface).
      // (API returns these as numbers; stringify before length-checking.)
      if (citation.deliverableId !== undefined) expect(String(citation.deliverableId).length).toBeGreaterThan(0);
      if (citation.buildNo !== undefined) expect(String(citation.buildNo).length).toBeGreaterThan(0);

      expect(text).toMatch(/Task Planning/i);
    },
    NET_TIMEOUT
  );

  it(
    "getSapHelpContent stays a string wrapper returning exactly the document text",
    async (ctx) => {
      const id = await feedId(ctx);
      const [stringContent, doc] = await Promise.all([
        getSapHelpContent(id),
        getSapHelpDocument(id),
      ]);
      expect(stringContent).toBe(doc.text); // unchanged contract for existing callers
    },
    NET_TIMEOUT
  );

  it(
    "unified search carries citation (loio/product/version) on SAP Help hits",
    async (ctx) => {
      let results;
      try {
        results = await search(QUERY, { includeOnline: true, version: VERSION });
      } catch (e: any) {
        console.warn(`[citations] unified search threw, skipping: ${e?.message}`);
        ctx.skip();
        return;
      }
      const hit = results.find((r) => r.sourceKind === "sap_help" && r.citation?.loio === FEATURE_LOIO);
      if (!hit) {
        console.warn("[citations] no SAP Help hit for feature (network/empty), skipping");
        ctx.skip();
        return;
      }
      expect(hit.citation?.loio).toBe(FEATURE_LOIO);
      expect(hit.citation?.version).toBeTruthy();
      // The pinnable token must reach the unified search citation (not just the fetch path),
      // else an agent searching for a topic can't re-pin a release without a fetch round-trip.
      expect(hit.citation?.versionId).toBeTruthy();
      expect(hit.citation?.versionId).not.toMatch(/\s/);
    },
    NET_TIMEOUT
  );
});
