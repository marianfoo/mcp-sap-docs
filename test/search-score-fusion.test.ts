import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchResult } from '../src/lib/search.js';

const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  semantic: vi.fn(),
  help: vi.fn(),
}));

vi.mock('../src/lib/searchDb.js', () => ({
  lookupExactDocs: () => [],
  searchFTS: () => mocks.rows,
}));
vi.mock('../src/lib/metadata.js', () => ({
  loadMetadata: () => ({}),
  getSourceBoosts: () => ({}),
  getAllContextBoosts: () => ({}),
  getContextBoosts: () => ({}),
  expandQueryTerms: (query: string) => [query],
}));
vi.mock('../src/lib/embeddingSearch.js', () => ({ buildSemanticResults: mocks.semantic }));
vi.mock('../src/lib/sapHelp.js', () => ({ searchSapHelp: mocks.help, ABAP_HELP_PRODUCTS: {} }));
vi.mock('../src/lib/localDocs.js', () => ({ searchCommunity: async () => ({ results: [] }) }));
vi.mock('../src/lib/softwareHeroes/index.js', () => ({
  searchSoftwareHeroesContent: async () => ({ results: [] }),
}));

import { search } from '../src/lib/search.js';

function row(id: string) {
  return { id: `/cap/${id}`, libraryId: '/cap', title: id, description: `Document ${id}`, relFile: `${id}.md`, bm25Score: -1 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [row('first'), row('second')];
  mocks.semantic.mockResolvedValue([]);
  mocks.help.mockResolvedValue({ results: [] });
});

describe('lexical and semantic score fusion', () => {
  it('changes the order when all candidates have embeddings and the semantic ranks disagree', async () => {
    mocks.rows.push(row('third'));
    mocks.semantic.mockImplementation(async (_query: string, candidates: SearchResult[]) =>
      [candidates[1], candidates[2], candidates[0]].map((result, rank) => ({
        ...result, sourceKind: 'semantic', finalScore: 0.7 / (61 + rank), bm25: 0, debug: { boost: 0.91 },
      })));
    const results = await search('query', { includeOnline: false, k: 3 });
    expect(results.map(result => result.id)).toEqual(['/cap/second', '/cap/first', '/cap/third']);
    expect(results[0].finalScore).toBeCloseTo(1 / 62 + 0.7 / 61, 12);
  });

  it('adds the semantic contribution so it can change the final search order', async () => {
    const lexical = await search('query', { includeOnline: false, k: 2 });
    mocks.semantic.mockImplementation(async (_query: string, candidates: SearchResult[]) => [
      { ...candidates[1], sourceKind: 'semantic', finalScore: 0.7 / 61, bm25: 0, debug: { boost: 0.91 } },
    ]);

    const fused = await search('query', { includeOnline: false, k: 2 });

    expect(fused.map(result => result.id)).toEqual(['/cap/second', '/cap/first']);
    expect(fused[0].finalScore).toBeCloseTo(lexical[1].finalScore + 0.7 / 61, 12);
    expect(fused[1]).toEqual(lexical[0]);
    expect(fused[0]).toMatchObject({ sourceKind: 'offline', path: '/cap/second', relFile: 'second.md', bm25: -1 });
  });

  it('preserves lexical scores when embeddings are unavailable or disabled', async () => {
    const results = await search('query', { includeOnline: false, k: 2 });
    expect(results.map(result => result.id)).toEqual(['/cap/first', '/cap/second']);
    expect(results[0].finalScore).toBeCloseTo(1 / 61, 12);
    expect(results[1].finalScore).toBeCloseTo(1 / 62, 12);
  });

  it('applies the document boost once to both rank contributions', async () => {
    const lexical = await search('first', { includeOnline: false, k: 2 });
    mocks.semantic.mockImplementation(async (_query: string, candidates: SearchResult[]) => [
      { ...candidates[0], sourceKind: 'semantic', finalScore: 0.7 / 61, bm25: 0, debug: { boost: 0.91 } },
    ]);
    const fused = await search('first', { includeOnline: false, k: 2 });
    expect(fused[0].finalScore).toBeCloseTo((1 / 61 + 0.7 / 61) * 1.5, 12);
    expect(fused[0].debug?.boost).toBe(lexical[0].debug?.boost);
    expect(fused[0].text).toBe(lexical[0].text);
  });

  it('does not accumulate repeated URLs from one online source', async () => {
    mocks.rows = [];
    mocks.help.mockResolvedValue({ results: [
      { id: 'first', title: 'Help', url: 'https://help.sap.com/docs/example?locale=en-US&version=1' },
      { id: 'duplicate', title: 'Help', url: 'https://help.sap.com/docs/example?locale=de-DE&version=1' },
    ] });
    const results = await search('query', { includeOnline: true, k: 5 });
    expect(results).toHaveLength(1);
    expect(results[0].finalScore).toBeCloseTo(0.9 * 2.5 / 61, 12);
  });

  it('passes only source-, sample-, language- and flavor-filtered candidates to semantics', async () => {
    mocks.rows = [row('first'),
      { ...row('sample'), id: '/abap-cheat-sheets/sample', libraryId: '/abap-cheat-sheets' },
      { ...row('translated'), id: '/sap-styleguides/CleanABAP_de', libraryId: '/sap-styleguides' },
      { ...row('cloud'), id: '/abap-docs-cloud/cloud', libraryId: '/abap-docs-cloud' },
      { ...row('standard'), id: '/abap-docs-standard/standard', libraryId: '/abap-docs-standard' },
    ];
    await search('query', { includeOnline: false, includeSamples: false, abapFlavor: 'cloud', sources: ['cap', 'abap-cheat-sheets', 'sap-styleguides', 'abap-docs-cloud', 'abap-docs-standard'], k: 5 });
    expect(mocks.semantic.mock.calls[0][1].map((result: SearchResult) => result.id))
      .toEqual(['/cap/first', '/abap-docs-cloud/cloud']);
  });
});
