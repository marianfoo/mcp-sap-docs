/**
 * Offline unit test for the search→fetch release round-trip (PR: release-aware fetch).
 *
 * search encodes the pinned `versionId` into the result id; fetch (getSapHelpContent) parses it
 * back off. The acceptance test is network-gated, so this pins the pure id logic offline.
 *
 * Key property (verified live against help.sap.com): `versionId` is an opaque, exact,
 * case-sensitive token whose format varies wildly across products — it must round-trip verbatim.
 */
import { describe, it, expect } from "vitest";
import { encodeSapHelpId, parseSapHelpId } from "../src/lib/sapHelp.js";

const LOIO = "007d655fd353410e9bbba4147f56c2f0";

// Real versionId shapes observed across SAP products on help.sap.com.
const VERSIONS = [
  "2025.001",        // S/4HANA   YYYY.FPS
  "2.0.08",          // HANA      X.Y.Z
  "10.0",            // Business One
  "1.149",           // SAPUI5
  "800.08",          // SAP GUI
  "7.2.21",          // Solution Manager
  "2211",            // Commerce  bare
  "2026_06",         // Concur    underscore
  "2211.JDK21.CCV2", // Commerce  mixed
  "Cloud",           // BTP       text
  "cloud",           // distinct lowercase bucket — case must survive
];

describe("sap-help id encode/parse round-trip", () => {
  it("plain id carries no version", () => {
    expect(encodeSapHelpId(LOIO)).toBe(`sap-help-${LOIO}`);
    expect(parseSapHelpId(`sap-help-${LOIO}`)).toEqual({ helpId: LOIO, version: undefined });
  });

  // VERSIONS includes both "Cloud" and "cloud", so this also proves case is preserved.
  it.each(VERSIONS)("round-trips versionId %s verbatim (any format, exact case)", (v) => {
    expect(parseSapHelpId(encodeSapHelpId(LOIO, v))).toEqual({ helpId: LOIO, version: v });
  });

  it("round-trips a derived url-slug id that contains the old '--v' sequence", () => {
    // Regression guard: the previous '--v' delimiter collided with slugs like '.../foo--video'.
    // The reserved '~' delimiter can never appear in a help id, so there is no collision.
    const id = "url-foo--video-guide-9ab12cd34ef5";
    expect(parseSapHelpId(`sap-help-${id}`)).toEqual({ helpId: id, version: undefined });
    expect(parseSapHelpId(encodeSapHelpId(id, "2025.001"))).toEqual({ helpId: id, version: "2025.001" });
  });

  it("treats a blank/whitespace version as none", () => {
    expect(encodeSapHelpId(LOIO, "   ")).toBe(`sap-help-${LOIO}`);
    expect(parseSapHelpId(encodeSapHelpId(LOIO, ""))).toEqual({ helpId: LOIO, version: undefined });
  });

  it("returns an empty helpId for a malformed (non-sap-help-) id", () => {
    expect(parseSapHelpId("garbage")).toEqual({ helpId: "", version: undefined });
  });
});
