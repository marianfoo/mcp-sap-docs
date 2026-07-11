import { describe, expect, it, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'node:fs';

type RequestHandler = (request: unknown, extra?: unknown) => unknown;

function getHandler(server: Server, method: string): RequestHandler {
  const handlers: Map<string, RequestHandler> = (server as unknown as { _requestHandlers: Map<string, RequestHandler> })._requestHandlers;
  const handler = handlers.get(method);
  if (!handler) {
    throw new Error(`Handler not registered for method: ${method}`);
  }
  return handler;
}

describe('retrieval eval fixtures', () => {
  it('records the deterministic search profile in the baseline', () => {
    const baseline = JSON.parse(readFileSync(new URL('./eval/baseline.json', import.meta.url), 'utf8'));

    expect(baseline.variant).toBe('sap-docs');
    expect(baseline.searchOptions).toEqual({ includeOnline: false, k: 30 });
    expect(baseline.k).toBe(30);
    expect(baseline.rows.length).toBeGreaterThan(0);
    expect(baseline.rows.every((row: { returned: number }) => row.returned <= 30)).toBe(true);
  });

  it('keeps the pairwise fixture as plain UTF-8 JSON with LF line endings', () => {
    const raw = readFileSync(new URL('./eval/pairwise-vanilla.json', import.meta.url), 'utf8');

    expect(raw.startsWith('\uFEFF')).toBe(false);
    expect(raw.includes('\r')).toBe(false);
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});

describe('search response schema', () => {
  it('detects source-specific contexts for ambiguous UI5 and wdi5 prompts', async () => {
    const { detectQueryContexts } = await import('../src/lib/search.js');

    expect(detectQueryContexts('Wizard')).toContain('ui5');
    expect(detectQueryContexts('Wizard CAP')).toEqual(expect.arrayContaining(['ui5', 'cap']));
    expect(detectQueryContexts('wdi5 table selection')).toEqual(expect.arrayContaining(['wdi5', 'ui5']));
  });

  it('validates and bounds untrusted legacy HTTP search options', async () => {
    const { normalizeUnifiedSearchOptions } = await import('../src/lib/search.js');

    expect(normalizeUnifiedSearchOptions({
      k: 30,
      includeOnline: false,
      includeSamples: false,
      abapFlavor: 'cloud',
      sources: ['/wdi5']
    })).toEqual({
      k: 30,
      includeOnline: false,
      includeSamples: false,
      abapFlavor: 'cloud',
      sources: ['/wdi5']
    });
    expect(normalizeUnifiedSearchOptions({ k: -1 }).k).toBe(1);
    expect(normalizeUnifiedSearchOptions({ k: 1_000_000 }).k).toBe(100);
    expect(() => normalizeUnifiedSearchOptions({ k: '30' })).toThrow('k must be a finite integer');
    expect(() => normalizeUnifiedSearchOptions({ includeOnline: 'false' })).toThrow('includeOnline must be a boolean');
    expect(() => normalizeUnifiedSearchOptions({ arbitraryOption: true })).toThrow('unsupported option');
  });

  it('applies offline constraints to full-corpus semantic recall', async () => {
    const { isSemanticDocumentAllowed } = await import('../src/lib/search.js');
    const defaults = {
      sourceFilters: null,
      includeSamples: true,
      requestedAbapFlavor: 'standard' as const,
      isNewsQuery: false
    };

    expect(isSemanticDocumentAllowed('/btp-fiori-tools/deploy/configuration', {
      ...defaults,
      sourceFilters: new Set(['btp-fiori-tools'])
    })).toBe(true);
    expect(isSemanticDocumentAllowed('/cloud-sdk-js/guides/deployment', {
      ...defaults,
      sourceFilters: new Set(['btp-fiori-tools'])
    })).toBe(false);
    expect(isSemanticDocumentAllowed('/openui5-samples/sap.m/Button', {
      ...defaults,
      includeSamples: false
    })).toBe(false);
    expect(isSemanticDocumentAllowed('/fiori-tools-samples/V4/apps/travel/ui5.yaml', {
      ...defaults,
      includeSamples: false
    })).toBe(false);
    expect(isSemanticDocumentAllowed('/teched2025-dt260/exercises/readme', {
      ...defaults,
      includeSamples: false
    })).toBe(false);
    expect(isSemanticDocumentAllowed('/abap-docs-cloud/ABAPSELECT', defaults)).toBe(false);
    expect(isSemanticDocumentAllowed('/abap-docs-cloud/ABAPSELECT', {
      ...defaults,
      requestedAbapFlavor: 'cloud'
    })).toBe(true);
    expect(isSemanticDocumentAllowed('/abap-docs-standard/ABENNEWS-758', defaults)).toBe(false);
  });

  it('does not invoke embedding work when the semantic artifact is unavailable', async () => {
    vi.resetModules();
    const embedQuery = vi.fn();
    const buildSemanticRecall = vi.fn(async () => []);

    vi.doMock('../src/lib/searchDb.js', () => ({
      lookupExactDocs: vi.fn(() => []),
      searchFTS: vi.fn(() => [])
    }));
    vi.doMock('../src/lib/embeddingSearch.js', () => ({
      isSemanticSearchAvailable: vi.fn(() => false),
      embedQuery,
      detectNewsIntent: vi.fn(),
      buildSemanticRecall,
      rerank: vi.fn(async (_query: string, docs: unknown[]) => docs)
    }));

    const { search } = await import('../src/lib/search.js');
    await search('what changed in this release', { includeOnline: false, k: 5 });

    expect(embedQuery).not.toHaveBeenCalled();
    expect(buildSemanticRecall).not.toHaveBeenCalled();
  });

  it('returns schema-compliant empty results instead of an MCP schema error', async () => {
    vi.resetModules();
    vi.doMock('../src/lib/search.js', () => ({
      search: vi.fn(async () => [])
    }));

    const { BaseServerHandler } = await import('../src/lib/BaseServerHandler.js');
    const server = new Server({
      name: 'Test Server',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    BaseServerHandler.configureServer(server);
    const handler = getHandler(server, 'tools/call');
    const request = CallToolRequestSchema.parse({
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: {
          query: 'query-that-should-not-match-anything',
          sources: ['wdi5']
        }
      }
    });

    const result = await handler(request) as any;
    const payload = JSON.parse(result.content[0].text);

    expect(payload.results).toEqual([]);
    expect(result.structuredContent.results).toEqual([]);
    expect(payload.error).toContain('No results');
  });
});
