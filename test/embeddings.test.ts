/**
 * Embeddings build artifact tests.
 *
 * Verifies that the `build:embeddings` step produced a valid `embeddings` table
 * in dist/data/docs.sqlite. All tests are skipped gracefully when the table is
 * absent (i.e., before the first `npm run build:embeddings` run).
 */
import { afterAll, describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import { existsSync } from "fs";

const DB_PATH = path.join(process.cwd(), "dist", "data", "docs.sqlite");

function openDb(): Database.Database | null {
  if (!existsSync(DB_PATH)) return null;
  return new Database(DB_PATH, { readonly: true, fileMustExist: true });
}

function embeddingsTableExists(db: Database.Database): boolean {
  const row = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'`
  ).get() as { name: string } | undefined;
  return !!row;
}

describe("embeddings build artifact", () => {
  const db = openDb();
  const tableExists = db ? embeddingsTableExists(db) : false;
  afterAll(() => db?.close());

  if (!tableExists) {
    it.skip(
      "embeddings table not yet built — run `npm run build:embeddings` first",
      () => {}
    );
    // No further tests
  } else {
    it("embeddings table exists in docs.sqlite", () => {
      expect(tableExists).toBe(true);
    });

    it("covers every indexed document and section, excluding code samples", () => {
      const row = db!
        .prepare("SELECT count(*) as n FROM embeddings")
        .get() as { n: number };
      const expected = db!.prepare(`
        SELECT count(DISTINCT id) AS n FROM docs
        WHERE type IN ('markdown', 'jsdoc', 'markdown-section')
      `).get() as { n: number };
      expect(row.n).toBeGreaterThan(0);
      expect(row.n).toBe(expected.n);
    });

    it("embedding dimension is 384 (BLOB length = 1536 bytes)", () => {
      const row = db!
        .prepare("SELECT min(length(vec)) as minLen, max(length(vec)) as maxLen FROM embeddings")
        .get() as { minLen: number; maxLen: number } | undefined;
      expect(row).toBeDefined();
      // 384 dimensions × 4 bytes (Float32) = 1536 bytes
      expect(row!.minLen).toBe(1536);
      expect(row!.maxLen).toBe(1536);
    });

    it("sample embedding is L2-normalized (‖v‖ ≈ 1.0)", () => {
      const row = db!
        .prepare("SELECT vec FROM embeddings ORDER BY doc_id LIMIT 1")
        .get() as { vec: Buffer } | undefined;
      expect(row).toBeDefined();

      const buf = row!.vec;
      const vec = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);

      let norm = 0;
      for (const v of vec) norm += v * v;
      norm = Math.sqrt(norm);

      // L2 norm of a normalized vector should be within 0.5% of 1.0
      expect(norm).toBeGreaterThan(0.995);
      expect(norm).toBeLessThan(1.005);
    });

    it("embedding IDs exactly match eligible document and section IDs", () => {
      // Compare sets once; avoid nondeterministic sampling and repeated FTS scans.
      const ids = new Set((db!.prepare("SELECT id FROM docs WHERE type IN ('markdown', 'jsdoc', 'markdown-section')").all() as { id: string }[]).map(row => row.id));
      const rows = db!
        .prepare("SELECT doc_id FROM embeddings")
        .all() as { doc_id: string }[];

      expect(rows.length).toBeGreaterThan(0);

      expect(new Set(rows.map(row => row.doc_id))).toEqual(ids);
    });
  }
});
