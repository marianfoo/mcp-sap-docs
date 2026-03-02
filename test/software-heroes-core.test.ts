/**
 * Tests for Software Heroes API core client error handling.
 * Verifies that network-level error causes (ENOTFOUND, ECONNREFUSED, etc.)
 * are propagated into the thrown error message for better diagnostics.
 *
 * No real network calls are made — fetch is stubbed.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { callSoftwareHeroesApi, buildCacheKey, TtlCache } from "../dist/src/lib/softwareHeroes/core.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("callSoftwareHeroesApi – error handling", () => {
  it("includes error.cause message when fetch fails with a network cause", async () => {
    // Simulate what Node.js does when DNS resolution fails:
    // fetch throws TypeError('fetch failed', { cause: Error('getaddrinfo ENOTFOUND ...') })
    const cause = new Error("getaddrinfo ENOTFOUND software-heroes.com");
    const networkError = new TypeError("fetch failed");
    (networkError as any).cause = cause;

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    await expect(
      callSoftwareHeroesApi("TEST", { key: "value" })
    ).rejects.toThrow(
      "Software Heroes API request failed: fetch failed (getaddrinfo ENOTFOUND software-heroes.com)"
    );
  });

  it("includes error.cause message when connection is refused", async () => {
    const cause = new Error("connect ECONNREFUSED 127.0.0.1:443");
    const networkError = new TypeError("fetch failed");
    (networkError as any).cause = cause;

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    await expect(
      callSoftwareHeroesApi("TEST", { key: "value" })
    ).rejects.toThrow(
      "Software Heroes API request failed: fetch failed (connect ECONNREFUSED 127.0.0.1:443)"
    );
  });

  it("does not append cause suffix when error has no cause", async () => {
    const networkError = new TypeError("fetch failed");
    // No .cause property set

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    await expect(
      callSoftwareHeroesApi("TEST", { key: "value" })
    ).rejects.toThrow("Software Heroes API request failed: fetch failed");

    // Ensure the message does NOT have an empty parentheses "()" suffix
    try {
      await callSoftwareHeroesApi("TEST", { key: "value" });
    } catch (err: any) {
      expect(err.message).not.toContain("()");
    }
  });

  it("throws timeout error when request is aborted", async () => {
    // Simulate AbortController triggering an AbortError
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            const abortErr = new Error("The operation was aborted.");
            abortErr.name = "AbortError";
            // Short delay to let setTimeout fire, but use very low timeoutMs in options
            setTimeout(() => reject(abortErr), 0);
          })
      )
    );

    await expect(
      callSoftwareHeroesApi("TEST", { key: "value" }, { timeoutMs: 1 })
    ).rejects.toThrow(/Software Heroes API timeout after \d+ms/);
  });

  it("throws when API returns non-ok HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      })
    );

    await expect(
      callSoftwareHeroesApi("TEST", { key: "value" })
    ).rejects.toThrow("Software Heroes API error: 503 Service Unavailable");
  });

  it("returns and caches a successful API response", async () => {
    const mockResponse = {
      status: true,
      msg: "ok",
      data: "some content",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      })
    );

    const result = await callSoftwareHeroesApi("UNIQUE_TEST_METHOD_CACHE", { unique: "yes" });
    expect(result).toEqual(mockResponse);
  });
});

describe("buildCacheKey", () => {
  it("builds a deterministic key sorted by param name", () => {
    const key1 = buildCacheKey("METH", { b: "2", a: "1" });
    const key2 = buildCacheKey("METH", { a: "1", b: "2" });
    expect(key1).toBe(key2);
    expect(key1).toBe("METH|a=1|b=2");
  });
});

describe("TtlCache", () => {
  it("returns undefined for expired entries", async () => {
    const cache = new TtlCache<string>(1); // 1ms TTL
    cache.set("key", "value");
    await new Promise((r) => setTimeout(r, 10)); // wait for expiry
    expect(cache.get("key")).toBeUndefined();
  });

  it("returns value for non-expired entries", () => {
    const cache = new TtlCache<string>(60_000);
    cache.set("key", "value");
    expect(cache.get("key")).toBe("value");
  });

  it("size() only counts non-expired entries", async () => {
    const cache = new TtlCache<string>(1); // 1ms TTL
    cache.set("a", "1");
    cache.set("b", "2");
    await new Promise((r) => setTimeout(r, 10));
    expect(cache.size()).toBe(0);
  });
});
