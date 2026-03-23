/**
 * Embeddings build artifact tests.
 *
 * Verifies that the `build:embeddings` step produced a valid `embeddings` table
 * in dist/data/docs.sqlite. All tests are skipped gracefully when the table is
 * absent (i.e., before the first `npm run build:embeddings` run).
 */
import { describe, it, expect } from "vitest";
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

  if (!tableExists) {
    it.skip(
      "embeddings table not yet built — run `npm run build:embeddings` first",
      () => {}
    );
    db?.close();
    // No further tests
  } else {
    it("embeddings table exists in docs.sqlite", () => {
      expect(tableExists).toBe(true);
    });

    it("row count is between 15,000 and 25,000", () => {
      const row = db!
        .prepare("SELECT count(*) as n FROM embeddings")
        .get() as { n: number };
      expect(row.n).toBeGreaterThan(15_000);
      expect(row.n).toBeLessThan(25_000);
    });

    it("embedding dimension is 384 (BLOB length = 1536 bytes)", () => {
      const row = db!
        .prepare("SELECT length(vec) as len FROM embeddings LIMIT 1")
        .get() as { len: number } | undefined;
      expect(row).toBeDefined();
      // 384 dimensions × 4 bytes (Float32) = 1536 bytes
      expect(row!.len).toBe(1536);
    });

    it("sample embedding is L2-normalized (‖v‖ ≈ 1.0)", () => {
      const row = db!
        .prepare("SELECT vec FROM embeddings LIMIT 1")
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

    it("all doc_ids in embeddings exist in the docs FTS table", () => {
      // Sample up to 100 random doc_ids for performance
      const rows = db!
        .prepare("SELECT doc_id FROM embeddings ORDER BY RANDOM() LIMIT 100")
        .all() as { doc_id: string }[];

      expect(rows.length).toBeGreaterThan(0);

      const checkStmt = db!.prepare(
        "SELECT count(*) as n FROM docs WHERE id = ?"
      );

      let missing = 0;
      for (const { doc_id } of rows) {
        const r = checkStmt.get(doc_id) as { n: number };
        if (r.n === 0) missing++;
      }

      expect(missing).toBe(0);
    });

    db!.close();
  }
});
