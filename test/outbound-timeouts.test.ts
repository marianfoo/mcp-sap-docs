/**
 * SAP Help and SAP Community requests must carry a timeout signal, so a stalled
 * upstream aborts the call instead of hanging the tool. fetch is stubbed with a
 * request that never answers and only ends when its signal aborts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const hangUntilAborted = (_url: unknown, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    if (init?.signal?.aborted) reject(init.signal.reason);
    else init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
  });

describe("outbound timeouts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SAP_HELP_TIMEOUT_MS", "50");
    vi.stubEnv("SAP_COMMUNITY_TIMEOUT_MS", "50");
    vi.stubGlobal("fetch", vi.fn(hangUntilAborted));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("SAP Community post fetch gives up and returns no posts", async () => {
    const { getCommunityPostsByIds } = await import("../src/lib/communityBestMatch.js");
    const started = Date.now();
    await expect(getCommunityPostsByIds(["1"])).resolves.toEqual({});
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("SAP Community search rejects instead of hanging when every request stalls", async () => {
    const { searchCommunityBestMatch } = await import("../src/lib/communityBestMatch.js");
    await expect(searchCommunityBestMatch("rap draft")).rejects.toThrow();
  });

  it("SAP Community search keeps the results of the requests that succeed", async () => {
    // The first request answers; the remaining ones stall until they time out.
    const ok = { ok: true, json: async () => ({ status: "success", data: { items: [
      { id: 7, subject: "RAP draft", view_href: "/t5/x/ba-p/7", post_time: "2026-01-01T00:00:00Z" },
    ] } }) } as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok).mockImplementation(hangUntilAborted));
    const { searchCommunityBestMatch } = await import("../src/lib/communityBestMatch.js");
    const hits = await searchCommunityBestMatch("rap draft");
    expect(hits).toHaveLength(1);
  });

  it("SAP Help search does not hang", async () => {
    const { searchSapHelp } = await import("../src/lib/sapHelp.js");
    const started = Date.now();
    const result = await searchSapHelp("rap draft", "latest");
    expect(result.results).toEqual([]);
    expect(result.error).toBeTruthy();
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it.each(["lookup", "metadata", "pagecontent"])("aborts stalled SAP Help %s requests", async stage => {
    const loio = "a".repeat(32);
    const hit = { loio, title: "Test page", productId: "TEST", language: "en-US",
      url: `/docs/TEST/${"b".repeat(32)}/${loio}.html` };
    const ok = (data: unknown) => ({ ok: true, json: async () => ({ data }) }) as Response;
    const requests = vi.fn((url: unknown, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("elasticsearch") && stage !== "lookup")
        return Promise.resolve(ok({ results: [hit] }));
      if (path.endsWith("deliverableMetadata") && stage === "pagecontent")
        return Promise.resolve(ok({ deliverable: { id: "test", buildNo: "1" }, filePath: `${loio}.html` }));
      return hangUntilAborted(url, init);
    });
    vi.stubGlobal("fetch", requests);
    const { getSapHelpDocument } = await import("../src/lib/sapHelp.js");
    vi.stubGlobal("sapHelpSearchCache", new Map());
    await expect(getSapHelpDocument(`sap-help-${loio}`)).rejects.toThrow("Failed to get SAP Help content");
    expect(requests).toHaveBeenCalledTimes(["lookup", "metadata", "pagecontent"].indexOf(stage) + 1);
    expect(requests.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true);
  });

  it("also aborts a Community response whose headers arrive but JSON body stalls", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => ({
      ok: true, json: () => hangUntilAborted(url, init)
    })));
    const { getCommunityPostsByIds } = await import("../src/lib/communityBestMatch.js");
    await expect(getCommunityPostsByIds(["1"])).resolves.toEqual({});
  });

  it("preserves healthy empty responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ status: "success", data: { items: [] } }) })));
    const { searchCommunityBestMatch } = await import("../src/lib/communityBestMatch.js");
    await expect(searchCommunityBestMatch("no matching posts")).resolves.toEqual([]);
  });

  it.each(["", "0", "-1", "invalid", "Infinity", "1.5", "2147483648"])("uses safe defaults for invalid timeout %j", async value => {
    vi.stubEnv("SAP_HELP_TIMEOUT_MS", value);
    vi.stubEnv("SAP_COMMUNITY_TIMEOUT_MS", value);
    const { CONFIG } = await import("../src/lib/config.js");
    expect(CONFIG.SAP_HELP_TIMEOUT_MS).toBe(10_000);
    expect(CONFIG.SAP_COMMUNITY_TIMEOUT_MS).toBe(10_000);
  });

  it("honors independent valid timeout settings", async () => {
    vi.stubEnv("SAP_HELP_TIMEOUT_MS", "250");
    vi.stubEnv("SAP_COMMUNITY_TIMEOUT_MS", "500");
    const { CONFIG } = await import("../src/lib/config.js");
    expect(CONFIG.SAP_HELP_TIMEOUT_MS).toBe(250);
    expect(CONFIG.SAP_COMMUNITY_TIMEOUT_MS).toBe(500);
  });
});
