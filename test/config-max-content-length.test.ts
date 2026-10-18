import { describe, it, expect, afterEach, vi } from "vitest";

// MAX_CONTENT_LENGTH is read once at module load, so every case needs a fresh
// import. Invalid configuration must not break document retrieval.

const ORIGINAL = process.env.MAX_CONTENT_LENGTH;

async function loadConfig(value?: string) {
  if (value === undefined) {
    delete process.env.MAX_CONTENT_LENGTH;
  } else {
    process.env.MAX_CONTENT_LENGTH = value;
  }
  vi.resetModules();
  const module = await import("../src/lib/config.js");
  return module.CONFIG.MAX_CONTENT_LENGTH;
}

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.MAX_CONTENT_LENGTH;
  } else {
    process.env.MAX_CONTENT_LENGTH = ORIGINAL;
  }
  vi.resetModules();
});

describe("CONFIG.MAX_CONTENT_LENGTH", () => {
  it("defaults to 75,000 when the variable is not set", async () => {
    expect(await loadConfig(undefined)).toBe(75_000);
  });

  it("takes a positive integer from the environment", async () => {
    expect(await loadConfig("2000")).toBe(2000);
    expect(await loadConfig("250000")).toBe(250_000);
  });

  it("falls back to the default for values that would break truncation", async () => {
    for (const bad of ["", "abc", "0", "-5", "12.5", "1e3,5", "Infinity", "9007199254740992"]) {
      expect(await loadConfig(bad)).toBe(75_000);
    }
  });
});