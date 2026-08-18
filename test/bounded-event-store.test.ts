import { describe, expect, it, vi } from "vitest";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { BoundedEventStore } from "../src/lib/boundedEventStore.js";

const message = (id: number): JSONRPCMessage => ({
  jsonrpc: "2.0",
  id,
  result: { id },
});

describe("BoundedEventStore", () => {
  it("replays events after the supplied event ID", async () => {
    const store = new BoundedEventStore({ ttlMs: 1_000, maxStreams: 3, maxEventsPerStream: 3 });
    const first = await store.storeEvent("stream-a", message(1));
    const second = await store.storeEvent("stream-a", message(2));
    const send = vi.fn(async () => {});

    expect(await store.getStreamIdForEventId(first)).toBe("stream-a");
    expect(await store.replayEventsAfter(first, { send })).toBe("stream-a");
    expect(send).toHaveBeenCalledWith(second, message(2));
  });

  it("bounds events within a stream", async () => {
    const store = new BoundedEventStore({ ttlMs: 1_000, maxStreams: 3, maxEventsPerStream: 2 });
    const discarded = await store.storeEvent("stream-a", message(1));
    const retained = await store.storeEvent("stream-a", message(2));
    await store.storeEvent("stream-a", message(3));

    expect(await store.getStreamIdForEventId(discarded)).toBeUndefined();
    expect(await store.getStreamIdForEventId(retained)).toBe("stream-a");
  });

  it("evicts the least recently used stream at capacity", async () => {
    let now = 0;
    const store = new BoundedEventStore({
      ttlMs: 1_000,
      maxStreams: 2,
      maxEventsPerStream: 2,
      now: () => now,
    });
    const oldest = await store.storeEvent("oldest", message(1));
    now = 1;
    const recent = await store.storeEvent("recent", message(2));
    now = 2;
    await store.getStreamIdForEventId(recent);
    now = 3;
    await store.storeEvent("new", message(3));

    expect(await store.getStreamIdForEventId(oldest)).toBeUndefined();
    expect(store.size).toBe(2);
  });

  it("expires old streams and clears all retained events", async () => {
    let now = 0;
    const store = new BoundedEventStore({
      ttlMs: 100,
      maxStreams: 2,
      maxEventsPerStream: 2,
      now: () => now,
    });
    await store.storeEvent("old", message(1));
    now = 101;

    expect(store.sweepExpired()).toBe(1);
    expect(store.size).toBe(0);

    await store.storeEvent("new", message(2));
    store.clear();
    expect(store.size).toBe(0);
  });
});
