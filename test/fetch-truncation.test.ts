import { afterEach, describe, expect, it, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CONFIG } from "../src/lib/config.js";
import { truncateContent } from "../src/lib/truncate.js";
import { getSapHelpDocument } from "../src/lib/sapHelp.js";
import { getCommunityPostsByIds } from "../src/lib/communityBestMatch.js";
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
      expect(document.text).toContain("<p>Short post</p>");
      expect(document.metadata).not.toHaveProperty("truncation");
    }
    expect(document.url).toBe("https://community.sap.com/t5/test/ba-p/123");
  });

  it("keeps resource reads as strings after the internal fetch return type changes", async () => {
    communityFixture("<p>Short post</p>");
    const result = await serverHandler("resources/read")({ method: "resources/read", params: { uri: "abap-docs://doc/community-123" } });
    expect(typeof result.contents[0].text).toBe("string");
    expect(result.contents[0].text).toContain("<p>Short post</p>");
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
