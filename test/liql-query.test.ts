/**
 * buildLiqlSearchUrl pastes user input into a LiQL string. Verified against the live API:
 * a quote is escaped by doubling it (it''s -> 200), while the old backslash form (it\'s) was a 400
 * because a backslash is a plain character in LiQL.
 */
import { describe, it, expect } from "vitest";
import { buildLiqlSearchUrl } from "../src/lib/communityBestMatch.js";

const liql = (url: string) => new URL(url).searchParams.get("q")!;

describe("buildLiqlSearchUrl", () => {
  it("doubles a single quote so it cannot end the string", () => {
    expect(liql(buildLiqlSearchUrl("what's new", 20, true))).toContain("MATCHES 'what''s new'");
  });

  it("leaves a backslash alone and still doubles the quote after it", () => {
    expect(liql(buildLiqlSearchUrl(String.raw`a\' OR 1`, 20, true))).toContain(String.raw`MATCHES 'a\'' OR 1'`);
  });

  it("ignores a non-numeric minKudos and limit instead of pasting them", () => {
    const q = liql(buildLiqlSearchUrl("x", "5 OR 1=1" as never, true, "1 OR 1=1" as never));
    expect(q).not.toContain("OR 1=1");
    expect(q).toContain("LIMIT 20");
    expect(q).not.toContain(">=");
  });

  it("keeps a numeric minKudos", () => {
    expect(liql(buildLiqlSearchUrl("x", 20, true, 3))).toContain("kudos.sum(weight) >= 3");
  });

  it("escapes every apostrophe in both broad-search clauses", () => {
    const q = liql(buildLiqlSearchUrl("SAP's 'new' features"));
    expect(q).toContain("(subject MATCHES 'SAP''s ''new'' features' OR body MATCHES 'SAP''s ''new'' features')");
    expect(q).toContain("AND depth = 0");
  });

  it("preserves literal percent signs, encoded text and Unicode", () => {
    expect(liql(buildLiqlSearchUrl("100% %27 Grüße", 20, true))).toContain("MATCHES '100% %27 Grüße'");
  });

  it.each([Infinity, -Infinity, NaN, -1, 0, Number.MAX_SAFE_INTEGER + 1, "Infinity"])("uses a valid fallback limit for %j", value => {
    expect(liql(buildLiqlSearchUrl("RAP", value as number, true))).toMatch(/LIMIT 20$/);
  });

  it.each([Infinity, -Infinity, NaN, -1, Number.MAX_SAFE_INTEGER + 1, "Infinity"])("omits invalid kudos threshold %j", value => {
    expect(liql(buildLiqlSearchUrl("RAP", 20, true, value as number))).not.toContain("kudos.sum(weight) >=");
  });

  it("keeps integer values and preserves fractional minimum thresholds", () => {
    expect(liql(buildLiqlSearchUrl("RAP", 5, true, 3))).toContain("kudos.sum(weight) >= 3 LIMIT 5");
    expect(liql(buildLiqlSearchUrl("RAP", 5.9, true, 3.9))).toContain("kudos.sum(weight) >= 4 LIMIT 5");
    expect(liql(buildLiqlSearchUrl("RAP", 5, true, 0.5))).toContain("kudos.sum(weight) >= 1 LIMIT 5");
  });
});
