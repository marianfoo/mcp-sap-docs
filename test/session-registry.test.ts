import { describe, expect, it } from "vitest";
import { SessionRegistry } from "../src/lib/sessionRegistry.js";

describe("SessionRegistry", () => {
  it("expires abandoned sessions but keeps recently used sessions", () => {
    let now = 0;
    const registry = new SessionRegistry<string>({
      idleTtlMs: 1_000,
      maxSessions: 10,
      now: () => now,
    });

    registry.add("abandoned", "a");
    registry.add("active", "b");
    now = 600;
    registry.get("active");
    now = 1_100;

    expect(registry.sweepExpired().map((record) => record.id)).toEqual(["abandoned"]);
    expect(registry.get("active")?.value).toBe("b");
    expect(registry.size).toBe(1);
  });

  it("evicts the least recently used session when the hard cap is reached", () => {
    let now = 0;
    const registry = new SessionRegistry<string>({
      idleTtlMs: 60_000,
      maxSessions: 2,
      now: () => now,
    });

    registry.add("oldest", "a");
    now = 1;
    registry.add("recent", "b");
    now = 2;
    registry.get("recent");
    now = 3;

    expect(registry.add("new", "c").map((record) => record.id)).toEqual(["oldest"]);
    expect(registry.size).toBe(2);
    expect(registry.get("oldest")).toBeUndefined();
  });

  it("returns all records and clears the registry during shutdown", () => {
    const registry = new SessionRegistry<string>({
      idleTtlMs: 1_000,
      maxSessions: 10,
    });
    registry.add("one", "a");
    registry.add("two", "b");

    expect(registry.takeAll().map((record) => record.id)).toEqual(["one", "two"]);
    expect(registry.size).toBe(0);
  });
});
