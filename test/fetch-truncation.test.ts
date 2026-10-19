import { afterEach, describe, expect, it, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CONFIG } from "../src/lib/config.js";
import { truncateContent } from "../src/lib/truncate.js";
import { getSapHelpDocument } from "../src/lib/sapHelp.js";
import { getCommunityPostsByIds } from "../src/lib/communityBestMatch.js";
import * as communityMarkdown from "../src/lib/communityMarkdown.js";
import { BaseServerHandler } from "../src/lib/BaseServerHandler.js";

vi.mock("../src/lib/sapHelp.js", () => ({
  getSapHelpDocument: vi.fn(),
  searchSapHelp: vi.fn(),
}));

const originalLimit = CONFIG.MAX_CONTENT_LENGTH;
afterEach(() => {
  CONFIG.MAX_CONTENT_LENGTH = originalLimit;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function serverHandler(method: string) {
  const server = new Server({ name: "Truncation test", version: "1" }, { capabilities: { tools: {}, resources: {} } });
  BaseServerHandler.configureServer(server);
  return (server as any)._requestHandlers.get(method);
}

function communityFixture(body: string) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    expect(input).toContain("https://community.sap.com/api/2.0/search?");
    return new Response(JSON.stringify({ status: "success", data: { items: [{
      id: "123", subject: "Test post", body, post_time: "2026-01-01T00:00:00Z",
      view_href: "https://community.sap.com/t5/test/ba-p/123"
    }] } }), { headers: { "Content-Type": "application/json" } });
  }));
}

describe("fetch truncation contract", () => {
  it.each([true, false])("Community loss metadata reaches both MCP response forms (truncated=%s)", async (long) => {
    CONFIG.MAX_CONTENT_LENGTH = 1_000;
    communityFixture(long ? "<p>" + "x".repeat(10_000) + "</p>" : "<p>Short post</p>");
    const result = await serverHandler("tools/call")({ method: "tools/call", params: { name: "fetch", arguments: { id: "community-123" } } });
    expect(result.isError).not.toBe(true);
    const document = result.structuredContent;
    expect(JSON.parse(result.content[0].text)).toEqual(document);
    expect(document.text.length).toBeLessThanOrEqual(1_000);
    if (long) {
      expect(document.metadata.truncation.wasTruncated).toBe(true);
      expect(document.metadata.truncation.truncatedLength).toBe(document.text.length);
      expect(document.metadata.truncation.originalLength).toBeGreaterThan(10_000);
      expect(document.metadata.truncation.omittedCharacters).toBeGreaterThan(9_000);
    } else {
      // The community body is converted before it is framed: the raw <p> is gone,
      // its text is not.
      expect(document.text).toContain("Short post");
      expect(document.text).not.toContain("<p>");
      expect(document.metadata).not.toHaveProperty("truncation");
    }
    expect(document.url).toBe("https://community.sap.com/t5/test/ba-p/123");
  });

  it("converts the community body before framing and truncating", async () => {
    CONFIG.MAX_CONTENT_LENGTH = 10_000;
    communityFixture("<H1>Section</H1><UL><LI>a<UL><LI>b</LI></UL></LI></UL>");
    const result = await serverHandler("tools/call")({ method: "tools/call", params: { name: "fetch", arguments: { id: "community-123" } } });
    const text = result.structuredContent.text;
    expect(text).toContain("## Section");              // shifted below the post title
    expect(text).toMatch(/- +a\n {4}- +b/);           // valid nested list indentation
    expect(text.match(/^# /gm) ?? []).toHaveLength(1); // only the frame's title
    expect(text).not.toContain("<H1>");
  });

  it("keeps resource reads as strings after the internal fetch return type changes", async () => {
    communityFixture("<p>Short post</p>");
    const result = await serverHandler("resources/read")({ method: "resources/read", params: { uri: "abap-docs://doc/community-123" } });
    expect(typeof result.contents[0].text).toBe("string");
    expect(result.contents[0].text).toContain("Short post");
  });

  it("does not lose later posts when a body contains an invalid numeric entity", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "success", data: { items: [
      { id: "123", subject: "Malformed entity", body: "<p>Before &#1114112; after</p>" },
      { id: "124", subject: "Next post", body: "<p>Still available</p>" },
    ] } }))));
    const posts = await getCommunityPostsByIds(["123", "124"]);
    expect(posts["123"].content).toContain("Before � after");
    expect(posts["124"].content).toContain("Still available");
  });

  it("converts fallback snippets too", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "success", data: { items: [
      { id: "123", subject: "Snippet", search_snippet: "<p>A <strong>useful</strong> summary.</p>" },
    ] } }))));
    const posts = await getCommunityPostsByIds(["123"]);
    expect(posts["123"].content).toContain("A **useful** summary.");
    expect(posts["123"].content).not.toContain("<p>");
  });

  it("keeps the original body and later posts if Markdown conversion fails", async () => {
    CONFIG.MAX_CONTENT_LENGTH = 1_000;
    vi.spyOn(communityMarkdown, "communityHtmlToMarkdown").mockImplementationOnce(() => {
      throw new RangeError("Unsupported markup");
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "success", data: { items: [
      { id: "123", subject: "Fallback", body: `<p>Original content ${"x".repeat(2_000)}</p>` },
      { id: "124", subject: "Next post", body: "<p>Still available</p>" },
    ] } }))));
    const posts = await getCommunityPostsByIds(["123", "124"]);
    expect(posts["123"].content).toContain("Markdown conversion failed; original HTML is shown below.");
    expect(posts["123"].content).toContain("<p>Original content ");
    expect(posts["123"].content.length).toBeLessThanOrEqual(1_000);
    expect(posts["123"].truncation?.omittedCharacters).toBeGreaterThan(1_000);
    expect(posts["124"].content).toContain("Still available");
    expect(posts["124"].content).not.toContain("<p>");
    expect(warning).toHaveBeenCalledOnce();
  });

  it("uses converted length when deciding whether to truncate", async () => {
    CONFIG.MAX_CONTENT_LENGTH = 1_000;
    communityFixture(`<p data-editor="${"x".repeat(10_000)}">Short post</p>`);
    const posts = await getCommunityPostsByIds(["123"]);
    expect(posts["123"].content).toContain("Short post");
    expect(posts["123"].content.length).toBeLessThan(1_000);
    expect(posts["123"]).not.toHaveProperty("truncation");
  });

  it("keeps the Community citation even when a tiny limit removes the header", async () => {
    CONFIG.MAX_CONTENT_LENGTH = 1;
    communityFixture("<p>Long enough to truncate</p>");
    const result = await serverHandler("tools/call")({ method: "tools/call", params: { name: "fetch", arguments: { id: "community-123" } } });
    expect(result.structuredContent.text.length).toBe(1);
    expect(result.structuredContent.url).toBe("https://community.sap.com/t5/test/ba-p/123");
    expect(result.structuredContent.metadata.truncation.wasTruncated).toBe(true);
  });

  it.each([true, false])("SAP Help retains citation and conditional truncation metadata (truncated=%s)", async (long) => {
    const { content, ...truncation } = truncateContent(long ? "x".repeat(10_000) : "Short page", 1_000);
    vi.mocked(getSapHelpDocument).mockResolvedValue({ text: content, citation: {
      title: "Help page", url: "https://help.sap.com/docs/test", loio: "test-loio", product: "test-product"
    } as never, ...(long ? { truncation } : {}) });
    const result = await serverHandler("tools/call")({ method: "tools/call", params: { name: "fetch", arguments: { id: "sap-help-test" } } });
    expect(result.isError).not.toBe(true);
    const document = result.structuredContent;
    expect(document.text).toBe(content);
    expect(document.url).toBe("https://help.sap.com/docs/test");
    expect(document.metadata.loio).toBe("test-loio");
    expect(document.metadata.truncation).toEqual(long ? truncation : undefined);
    expect(JSON.parse(result.content[0].text)).toEqual(document);
  });

  it("preserves the Community missing-post result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "success", data: { items: [] } }))));
    expect(await getCommunityPostsByIds(["123"])).toEqual({});
  });
});
