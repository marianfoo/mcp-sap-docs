import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

it('rejects empty eligible text before loading a model or replacing existing vectors', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'embedding-build-validation-'));
  try {
    mkdirSync(join(cwd, 'dist/data'), { recursive: true });
    writeFileSync(join(cwd, 'dist/data/index.json'), JSON.stringify({ fixture: { docs: [
      { id: '/fixture/first', type: 'markdown', title: 'First document' },
      { id: '/fixture/empty', type: 'markdown-section', description: '  ' },
      { id: '/fixture/last', type: 'jsdoc', title: 'Last document' },
    ] } }));
    const dbPath = join(cwd, 'dist/data/docs.sqlite');
    const db = new Database(dbPath);
    db.exec("CREATE TABLE embeddings (doc_id TEXT PRIMARY KEY, vec BLOB); INSERT INTO embeddings VALUES ('/previous', X'00');");
    db.close();

    const result = spawnSync(process.execPath, [resolve('dist/scripts/build-embeddings.js')], {
      cwd, encoding: 'utf8', timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No embedding text for /fixture/empty');
    expect(result.stdout).not.toContain('Loading model');
    expect(result.stdout).not.toContain('Embeddings built successfully');
    const preserved = new Database(dbPath, { readonly: true });
    try {
      expect(preserved.prepare('SELECT doc_id FROM embeddings').all()).toEqual([{ doc_id: '/previous' }]);
    } finally { preserved.close(); }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
