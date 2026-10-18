import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../src/lib/config.js";
import { getSapHelpDocument, getSapHelpContent } from "../src/lib/sapHelp.js";

const originalLimit = CONFIG.MAX_CONTENT_LENGTH;
const originalCache = global.sapHelpSearchCache;
afterEach(() => {
  CONFIG.MAX_CONTENT_LENGTH = originalLimit;
  global.sapHelpSearchCache = originalCache;
  vi.unstubAllGlobals();
});

const loio = "cc2d0d9e2376428d991a732344a85e42";
const url = `https://help.sap.com/docs/TEST/5967a369d4b74f7a9c2b91f5df8e6ab6/${loio}.html`;

describe("SAP Help truncation through the real fetch pipeline", () => {
  it.each([true, false])("converts HTML and reports loss only when needed (long=%s)", async (long) => {
    CONFIG.MAX_CONTENT_LENGTH = 1000;
    global.sapHelpSearchCache = new Map([[loio, { loio, title: "Test page", productId: "TEST", versionId: "Cloud", url } as any]]);
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input.includes("/deliverableMetadata?")) {
        return Response.json({ data: { deliverable: { id: 123, buildNo: 456 }, filePath: `${loio}.html` } });
      }
      expect(input).toContain("/pagecontent?");
      return Response.json({ data: { currentPage: { t: "Test page" }, body: `<p>${long ? "Documentation. ".repeat(1000) : "Short documentation."}</p>` } });
    }));
    const result = await getSapHelpDocument(`sap-help-${loio}`);
    expect(result.text.length).toBeLessThanOrEqual(1000);
    expect(result.text).not.toContain("<p>");
    expect(result.citation).toMatchObject({ loio, url, deliverableId: 123, buildNo: 456 });
    if (long) {
      expect(result.truncation).toMatchObject({ wasTruncated: true, truncatedLength: result.text.length });
      expect(result.truncation!.originalLength).toBeGreaterThan(14_000);
      expect(result.truncation!.omittedCharacters).toBeGreaterThan(13_000);
    } else {
      expect(result.truncation).toBeUndefined();
      expect(result.text).toContain("Short documentation.");
    }
    expect(await getSapHelpContent(`sap-help-${loio}`)).toBe(result.text);
  });

  it("reports loss on the metadata-only path without a LOIO", async () => {
    CONFIG.MAX_CONTENT_LENGTH = 1000;
    global.sapHelpSearchCache = new Map([["derived", { title: "Search result", snippet: "Summary ".repeat(1000), url } as any]]);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await getSapHelpDocument("sap-help-derived");
    expect(fetch).not.toHaveBeenCalled();
    expect(result.text.length).toBeLessThanOrEqual(1000);
    expect(result.truncation?.wasTruncated).toBe(true);
    expect(result.citation).toMatchObject({ loio: null, url });
  });
});
