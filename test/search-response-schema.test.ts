import { describe, expect, it, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

type RequestHandler = (request: unknown, extra?: unknown) => unknown;

function getHandler(server: Server, method: string): RequestHandler {
  const handlers: Map<string, RequestHandler> = (server as unknown as { _requestHandlers: Map<string, RequestHandler> })._requestHandlers;
  const handler = handlers.get(method);
  if (!handler) {
    throw new Error(`Handler not registered for method: ${method}`);
  }
  return handler;
}

describe('search response schema', () => {
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
