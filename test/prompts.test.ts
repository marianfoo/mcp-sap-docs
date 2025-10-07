import { describe, expect, it } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  GetPromptRequestSchema,
  GetPromptResultSchema,
  ListPromptsRequestSchema,
  ListPromptsResultSchema
} from '@modelcontextprotocol/sdk/types.js';
import { BaseServerHandler } from '../src/lib/BaseServerHandler.js';

type RequestHandler = (request: unknown, extra?: unknown) => unknown;

function createTestServer() {
  const server = new Server({
    name: 'Test Server',
    version: '1.0.0'
  }, {
    capabilities: {
      tools: {},
      prompts: {}
    }
  });

  BaseServerHandler.configureServer(server);

  return server;
}

function getHandler(server: Server, method: string): RequestHandler {
  const handlers: Map<string, RequestHandler> = (server as unknown as { _requestHandlers: Map<string, RequestHandler> })._requestHandlers;
  const handler = handlers.get(method);
  if (!handler) {
    throw new Error(`Handler not registered for method: ${method}`);
  }
  return handler;
}

describe('Prompt handlers', () => {
  it('lists prompts with schema-compliant metadata', async () => {
    const server = createTestServer();
    const handler = getHandler(server, 'prompts/list');

    const request = ListPromptsRequestSchema.parse({ method: 'prompts/list' });
    const result = await handler(request);
    const parsed = ListPromptsResultSchema.safeParse(result);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const prompts = parsed.data.prompts;
    expect(prompts.length).toBeGreaterThan(0);

    const searchPrompt = prompts.find(prompt => prompt.name === 'sap_search_help');
    expect(searchPrompt).toBeDefined();
    expect(searchPrompt?.title).toBe('SAP Documentation Search Helper');
    expect(searchPrompt?.arguments?.some(arg => arg.name === 'domain')).toBe(true);
  });

  it('returns templated prompt content for sap_search_help', async () => {
    const server = createTestServer();
    const handler = getHandler(server, 'prompts/get');

    const request = GetPromptRequestSchema.parse({
      method: 'prompts/get',
      params: {
        name: 'sap_search_help',
        arguments: {
          domain: 'SAPUI5',
          context: 'routing features'
        }
      }
    });

    const result = await handler(request);
    const parsed = GetPromptResultSchema.parse(result);

    expect(parsed.messages.length).toBeGreaterThan(0);
    const [message] = parsed.messages;
    expect(message.role).toBe('user');
    expect(message.content.type).toBe('text');
    expect(message.content.text).toContain('SAPUI5');
    expect(message.content.text).toContain('routing features');
  });

  it('returns default guidance when optional arguments omitted', async () => {
    const server = createTestServer();
    const handler = getHandler(server, 'prompts/get');

    const request = GetPromptRequestSchema.parse({
      method: 'prompts/get',
      params: {
        name: 'sap_troubleshoot'
      }
    });

    const result = await handler(request);
    const parsed = GetPromptResultSchema.parse(result);

    expect(parsed.description).toBe('Troubleshooting guide for SAP');
    const [message] = parsed.messages;
    expect(message.role).toBe('user');
    expect(message.content.type).toBe('text');
    expect(message.content.text).toContain("I'm experiencing an issue with SAP");
  });
});
