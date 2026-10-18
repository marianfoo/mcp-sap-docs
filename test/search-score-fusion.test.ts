import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchResult } from '../src/lib/search.js';

const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  sources: [] as { id: string; type: string }[],
  contexts: {} as Record<string, Record<string, number>>,
  variants: null as string[] | null,
  variantRows: {} as Record<string, Record<string, unknown>[]>,
  semantic: vi.fn(),
  help: vi.fn(),
}));

vi.mock('../src/lib/searchDb.js', () => ({
  lookupExactDocs: () => [],
  searchFTS: (query: string, _filters: unknown, limit: number) => (mocks.variantRows[query] ?? mocks.rows).slice(0, limit),
}));
vi.mock('../src/lib/metadata.js', () => ({
  loadMetadata: () => ({ sources: mocks.sources }),
  getSourceBoosts: () => ({}),
  getAllContextBoosts: () => mocks.contexts,
  getContextBoosts: () => ({}),
  expandQueryTerms: (query: string) => mocks.variants ?? [query],
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
  mocks.sources = [];
  mocks.contexts = {};
  mocks.variants = null;
  mocks.variantRows = {};
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

  it('recognizes new sample sources from metadata and boosts them only for sample requests', async () => {
    mocks.sources = [{ id: 'new-samples', type: 'samples' }];
    mocks.contexts = { ui5: { '/new-samples': 0.9 } };
    mocks.rows = [{ ...row('neutral'), id: '/new-samples/file', libraryId: '/new-samples' }];
    for (const query of ['UI5 deployment configuration', 'UI5 deployment tutorial', 'UI5 deployment tutorials', 'how to deploy UI5']) {
      const result = await search(query, { includeOnline: false });
      expect(result[0].debug?.boost).toBe(0);
    }
    for (const query of ['UI5 deployment sample', 'UI5 deployment samples', 'UI5 examples', 'UI5 handlers', 'UI5 snippets', 'UI5 implementations']) {
      const examples = await search(query, { includeOnline: false });
      expect(examples[0].debug?.boost).toBeCloseTo(2.4);
    }
    expect(await search('UI5 deployment sample', { includeOnline: false, includeSamples: false })).toEqual([]);
  });

  it('applies the CAP penalty only to CAP, not to a bare CDS query', async () => {
    mocks.rows = [{ ...row('neutral'), id: '/abap-docs-standard/neutral', libraryId: '/abap-docs-standard' }];
    const cds = await search('CDS view input parameters', { includeOnline: false });
    const cap = await search('CAP view input parameters', { includeOnline: false });
    expect(cds[0].debug?.boost).toBe(0.5);
    expect(cap[0].debug?.boost).toBeCloseTo(-0.4);
  });

  it('uses synonym variants to fill a sparse pool, without replacing a full original pool', async () => {
    mocks.variants = ['query', 'expanded'];
    mocks.variantRows = {
      query: Array.from({ length: 200 }, (_, i) => row(`document-${i}`)),
      expanded: [row('synonym-only')],
    };
    await search('query', { includeOnline: false, k: 10 });
    expect(mocks.semantic.mock.calls[0][1].map((result: SearchResult) => result.id)).not.toContain('/cap/synonym-only');
    mocks.variantRows.query = mocks.variantRows.query.slice(0, 20);
    const sparse = await search('query', { includeOnline: false, k: 30 });
    expect(sparse.map(result => result.id)).toContain('/cap/synonym-only');
  });

  it('keeps the default top ten independent of the requested result count', async () => {
    mocks.rows = Array.from({ length: 120 }, (_, i) => row(`document-${i}`));
    mocks.rows[80] = {
      ...row('abap needle'), id: '/abap-docs-standard/needle', libraryId: '/abap-docs-standard',
    };
    const ten = await search('ABAP needle', { includeOnline: false, k: 10 });
    const thirty = await search('ABAP needle', { includeOnline: false, k: 30 });
    expect(ten.map(result => result.id)).toEqual(thirty.slice(0, 10).map(result => result.id));
    expect(ten[0].id).toBe('/abap-docs-standard/needle');
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
