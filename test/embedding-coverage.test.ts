import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { SearchResult } from '../src/lib/search.js';

const mocks = vi.hoisted(() => ({
  db: null as Database.Database | null,
  pipeline: vi.fn(),
  weight: 0.7,
}));
vi.mock('../src/lib/searchDb.js', () => ({ openDb: () => mocks.db! }));
vi.mock('../src/lib/config.js', () => ({ CONFIG: {
  get EMBEDDING_WEIGHT() { return mocks.weight; }, MODELS_DIR: 'unused-test-cache',
} }));
vi.mock('@huggingface/transformers', () => ({ pipeline: mocks.pipeline, env: {} }));

function candidate(id: string): SearchResult {
  return { id, text: id, bm25: -1, sourceId: 'cap', path: id, relFile: 'guide.md', finalScore: 1 / 61, sourceKind: 'offline' };
}

function insertVector(id: string, values = [1, 0]) {
  mocks.db!.prepare('INSERT INTO embeddings VALUES (?, ?)').run(id, Buffer.from(new Float32Array(values).buffer));
}

beforeEach(() => {
  vi.resetModules();
  mocks.weight = 0.7;
  mocks.pipeline.mockReset().mockResolvedValue(async () => ({ data: new Float32Array([1, 0]) }));
  mocks.db = new Database(':memory:');
  mocks.db.exec(`
    CREATE TABLE docs (id TEXT, type TEXT);
    INSERT INTO docs VALUES ('/cap/guide', 'markdown'), ('/cap/guide#section', 'markdown-section'), ('/cap/sample', 'sample');
    CREATE TABLE embeddings (doc_id TEXT PRIMARY KEY, vec BLOB NOT NULL);
  `);
});

afterEach(() => { mocks.db?.close(); vi.restoreAllMocks(); });

describe('embedding artifact coverage', () => {
  it('uses lexical fallback for every query on an old artifact, even if its candidates have vectors', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    insertVector('/cap/guide');
    const { buildSemanticResults } = await import('../src/lib/embeddingSearch.js');
    expect(await buildSemanticResults('guide', [candidate('/cap/guide')], 5)).toEqual([]);
    expect(await buildSemanticResults('section', [candidate('/cap/guide#section')], 5)).toEqual([]);
    expect(mocks.pipeline).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Run build:embeddings and restart'));
  });

  it('accepts complete document coverage while leaving code samples lexical-only', async () => {
    insertVector('/cap/guide', [0, 1]);
    insertVector('/cap/guide#section');
    const { buildSemanticResults } = await import('../src/lib/embeddingSearch.js');
    const candidates = ['/cap/guide', '/cap/guide#section', '/cap/sample'].map(candidate);
    const results = await buildSemanticResults('query', candidates, 5);
    expect(results.map(result => result.id)).toEqual(['/cap/guide#section', '/cap/guide']);
    expect(results[0].finalScore).toBeCloseTo(0.7 / 61, 12);
    expect(mocks.pipeline).toHaveBeenCalledTimes(1);
  });

  it('falls back consistently when even one whole-document vector is missing', async () => {
    insertVector('/cap/guide#section');
    const { buildSemanticResults } = await import('../src/lib/embeddingSearch.js');
    expect(await buildSemanticResults('section', [candidate('/cap/guide#section')], 5)).toEqual([]);
    expect(mocks.pipeline).not.toHaveBeenCalled();
  });

  it('does not require a model when embeddings are disabled or absent', async () => {
    mocks.weight = 0;
    const { buildSemanticResults } = await import('../src/lib/embeddingSearch.js');
    expect(await buildSemanticResults('query', [candidate('/cap/guide')], 5)).toEqual([]);
    mocks.weight = 0.7;
    mocks.db!.exec('DROP TABLE embeddings');
    expect(await buildSemanticResults('query', [candidate('/cap/guide')], 5)).toEqual([]);
    expect(mocks.pipeline).not.toHaveBeenCalled();
  });

  it('returns lexical fallback when model loading fails on a complete artifact', async () => {
    insertVector('/cap/guide');
    insertVector('/cap/guide#section');
    mocks.pipeline.mockRejectedValue(new Error('model unavailable'));
    const { buildSemanticResults } = await import('../src/lib/embeddingSearch.js');
    expect(await buildSemanticResults('query', [candidate('/cap/guide')], 5)).toEqual([]);
  });
});
