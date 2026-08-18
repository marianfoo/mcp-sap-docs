export interface SessionRegistryOptions {
  idleTtlMs: number;
  maxSessions: number;
  now?: () => number;
}

export interface SessionRecord<T> {
  id: string;
  value: T;
  createdAt: number;
  lastActivityAt: number;
}

/**
 * Bounded registry for stateful MCP transports.
 *
 * Public MCP clients do not reliably terminate sessions. Keeping transports in
 * an unbounded object therefore retains an MCP Server instance for every
 * abandoned client until the Node.js process runs out of heap.
 */
export class SessionRegistry<T> {
  private readonly records = new Map<string, SessionRecord<T>>();
  private readonly now: () => number;

  constructor(private readonly options: SessionRegistryOptions) {
    if (!Number.isFinite(options.idleTtlMs) || options.idleTtlMs <= 0) {
      throw new Error("idleTtlMs must be a positive number");
    }
    if (!Number.isInteger(options.maxSessions) || options.maxSessions <= 0) {
      throw new Error("maxSessions must be a positive integer");
    }
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.records.size;
  }

  get(id: string): SessionRecord<T> | undefined {
    const record = this.records.get(id);
    if (record) {
      record.lastActivityAt = this.now();
    }
    return record;
  }

  add(id: string, value: T): SessionRecord<T>[] {
    const timestamp = this.now();
    this.records.set(id, {
      id,
      value,
      createdAt: timestamp,
      lastActivityAt: timestamp,
    });

    const evicted: SessionRecord<T>[] = [];
    while (this.records.size > this.options.maxSessions) {
      let oldest: SessionRecord<T> | undefined;
      for (const record of this.records.values()) {
        if (!oldest || record.lastActivityAt < oldest.lastActivityAt) {
          oldest = record;
        }
      }

      if (!oldest) break;
      this.records.delete(oldest.id);
      evicted.push(oldest);
    }

    return evicted;
  }

  delete(id: string): SessionRecord<T> | undefined {
    const record = this.records.get(id);
    if (record) {
      this.records.delete(id);
    }
    return record;
  }

  sweepExpired(): SessionRecord<T>[] {
    const expiryCutoff = this.now() - this.options.idleTtlMs;
    const expired: SessionRecord<T>[] = [];

    for (const record of this.records.values()) {
      if (record.lastActivityAt <= expiryCutoff) {
        this.records.delete(record.id);
        expired.push(record);
      }
    }

    return expired;
  }

  takeAll(): SessionRecord<T>[] {
    const records = [...this.records.values()];
    this.records.clear();
    return records;
  }

  oldestIdleMs(): number {
    const timestamp = this.now();
    let oldestActivity = timestamp;

    for (const record of this.records.values()) {
      oldestActivity = Math.min(oldestActivity, record.lastActivityAt);
    }

    return this.records.size === 0 ? 0 : timestamp - oldestActivity;
  }
}
