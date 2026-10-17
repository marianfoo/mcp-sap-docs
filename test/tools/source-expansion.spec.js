import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const queries = [
  ['btp-connectivity', 'principal propagation'],
  ['cloud-sdk-python', 'destination service'],
  ['cloud-sdk-ai-python', 'document grounding'],
  ['odata-vocabularies', 'LineItem'],
  ['btp-job-scheduling-service', 'authentication'],
  ['btp-cloud-logging', 'ingest observability data'],
  ['btp-cloud-identity-services', 'trust'],
  ['btp-cloud-identity-integration', 'single sign on'],
  ['btp-integration-suite', 'CSRF token handling'],
  ['btp-event-mesh', 'queues'],
  ['btp-business-application-studio', 'dev spaces'],
  ['btp-continuous-integration-and-delivery', 'pipeline'],
  ['btp-cloud-transport-management', 'transport nodes'],
];

const metadata = JSON.parse(readFileSync('src/metadata.json', 'utf8')).sources;

function payload(result) {
  assert.ok(!result.isError, JSON.stringify(result));
  return result.structuredContent || JSON.parse(result.content.find(item => item.type === 'text').text);
}

export default [{
  name: 'new documentation sources support MCP search and fetch with upstream URLs',
  validate: async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['dist/src/server.js'],
      env: { ...process.env, MCP_VARIANT: 'sap-docs', EMBEDDING_WEIGHT: '0' },
      stderr: 'ignore',
    });
    const client = new Client({ name: 'source-expansion-test', version: '1.0.0' });
    try {
      await client.connect(transport);
      const searchTool = (await client.listTools()).tools.find(tool => tool.name === 'search');
      for (const [source, query] of queries) {
        assert.ok(searchTool.description.includes(source), `${source}: missing from MCP tool description`);
        const response = payload(await client.callTool({
          name: 'search',
          arguments: { query, sources: [source], includeOnline: false, k: 5 },
        }));
        assert.ok(response.results.length > 0, `${source}: no search results for ${query}`);
        assert.ok(response.results.every(result => result.library_id === `/${source}`), `${source}: source filter leaked`);
        const hit = response.results[0];
        assert.match(hit.url, /^https:\/\/github\.com\/.+\/blob\/main\/.+\.mdx?(?:#.*)?$/);
        const config = metadata.find(entry => entry.libraryId === `/${source}`);
        assert.ok(config, `${source}: missing source metadata`);
        assert.ok(hit.url.startsWith(`${config.baseUrl}/`), `${source}: unexpected source URL`);
        const file = decodeURIComponent(hit.url.split('#')[0].slice(config.baseUrl.length + 1));
        assert.ok(existsSync(join('sources', config.sourcePath, file)), `${source}: URL has no checked-out file: ${hit.url}`);
        const document = payload(await client.callTool({ name: 'fetch', arguments: { id: hit.id } }));
        assert.ok(document.text.length > 100, `${source}: empty document`);
        assert.equal(document.url.split('#')[0], hit.url.split('#')[0], `${source}: search/fetch source URL mismatch`);
      }
      for (const [query, expectedId] of [
        ['OData UI LineItem annotation', '/odata-vocabularies/UI#LineItem'],
        ['Common.ValueList', '/odata-vocabularies/Common#ValueList'],
        ['UI.SelectionFields', '/odata-vocabularies/UI#SelectionFields'],
      ]) {
        const response = payload(await client.callTool({
          name: 'search', arguments: { query, includeOnline: false, k: 10 },
        }));
        assert.ok(response.results.slice(0, 3).some(hit => hit.id === expectedId), `${query}: definition missing from top 3`);
      }
      return { passed: true, message: `${queries.length} sources searched/fetched; 3 unfiltered OData definitions found` };
    } finally {
      await client.close();
    }
  },
}];
