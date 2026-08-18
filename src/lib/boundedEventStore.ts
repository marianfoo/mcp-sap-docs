import { randomUUID } from "node:crypto";
import type {
  EventId,
  EventStore,
  StreamId,
} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export interface BoundedEventStoreOptions {
  ttlMs: number;
  maxStreams: number;
  maxEventsPerStream: number;
  now?: () => number;
}

interface StoredEvent {
  eventId: EventId;
  message: JSONRPCMessage;
}

interface StoredStream {
  events: StoredEvent[];
  lastActivityAt: number;
}

/**
 * Short-lived, per-session event history for MCP stream resumption.
 *
 * The previous global store kept every stream key for the lifetime of the
 * process and also allowed an event ID from one session to be looked up through
 * another session's transport. Scoping this store to one session and bounding
 * both stream and event counts preserves resumability without unbounded memory.
 */
export class BoundedEventStore implements EventStore {
  private readonly streams = new Map<StreamId, StoredStream>();
  private readonly now: () => number;

  constructor(private readonly options: BoundedEventStoreOptions) {
    for (const [name, value] of Object.entries({
      ttlMs: options.ttlMs,
      maxStreams: options.maxStreams,
      maxEventsPerStream: options.maxEventsPerStream,
    })) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
      }
    }
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.streams.size;
  }

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    this.sweepExpired();

    const timestamp = this.now();
    let stream = this.streams.get(streamId);
    if (!stream) {
      this.evictOldestStreamIfFull();
      stream = { events: [], lastActivityAt: timestamp };
      this.streams.set(streamId, stream);
    }

    stream.lastActivityAt = timestamp;
    const eventId = `event-${randomUUID()}`;
    stream.events.push({ eventId, message });
    if (stream.events.length > this.options.maxEventsPerStream) {
      stream.events.splice(0, stream.events.length - this.options.maxEventsPerStream);
    }

    return eventId;
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    this.sweepExpired();
    for (const [streamId, stream] of this.streams) {
      if (stream.events.some((event) => event.eventId === eventId)) {
        stream.lastActivityAt = this.now();
        return streamId;
      }
    }
    return undefined;
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> },
  ): Promise<StreamId> {
    this.sweepExpired();
    for (const [streamId, stream] of this.streams) {
      const eventIndex = stream.events.findIndex((event) => event.eventId === lastEventId);
      if (eventIndex === -1) continue;

      stream.lastActivityAt = this.now();
      for (const event of stream.events.slice(eventIndex + 1)) {
        await send(event.eventId, event.message);
      }
      return streamId;
    }

    return `stream-${randomUUID()}`;
  }

  sweepExpired(): number {
    const cutoff = this.now() - this.options.ttlMs;
    let removed = 0;
    for (const [streamId, stream] of this.streams) {
      if (stream.lastActivityAt <= cutoff) {
        this.streams.delete(streamId);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.streams.clear();
  }

  private evictOldestStreamIfFull(): void {
    if (this.streams.size < this.options.maxStreams) return;

    let oldestId: StreamId | undefined;
    let oldestActivity = Number.POSITIVE_INFINITY;
    for (const [streamId, stream] of this.streams) {
      if (stream.lastActivityAt < oldestActivity) {
        oldestId = streamId;
        oldestActivity = stream.lastActivityAt;
      }
    }

    if (oldestId !== undefined) {
      this.streams.delete(oldestId);
    }
  }
}
