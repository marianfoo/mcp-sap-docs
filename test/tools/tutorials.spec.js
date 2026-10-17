import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import queries from '../eval/tutorial-queries.js';

const config = JSON.parse(readFileSync('config/tutorials.json', 'utf8'));
function payload(result) {
  assert.ok(!result.isError, JSON.stringify(result));
  return result.structuredContent || JSON.parse(result.content.find(item => item.type === 'text').text);
}

export default [{
  name: 'curated tutorials are discoverable without filters and all 32 can be fetched',
  validate: async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/src/server.js'],
      env: { ...process.env, MCP_VARIANT: 'sap-docs', EMBEDDING_WEIGHT: '0' }, stderr: 'ignore' });
    const client = new Client({ name: 'tutorial-coverage-test', version: '1.0.0' });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const searchTool = tools.tools.find(tool => tool.name === 'search');
      for (const [group, selection] of Object.entries(config.groups)) {
        assert.ok(searchTool.description.includes(`sap-tutorials-${group}`));
        for (const id of selection.tutorials) {
          const result = payload(await client.callTool({ name: 'fetch', arguments: { id: `/sap-tutorials-${group}/${id}` } }));
          assert.equal(result.url, config.urlOverrides[id] || `https://developers.sap.com/tutorials/${id}`);
          assert.ok(result.text.includes('## Prerequisites'), `${id}: missing prerequisites`);
          assert.ok(result.text.length > 500, `${id}: missing body`);
        }
      }
      for (const query of queries) {
        const result = payload(await client.callTool({ name: 'search', arguments: { query: query.query, includeOnline: false, k: 10 } }));
        assert.ok(result.results.some(hit => query.golds.some(gold => hit.id.includes(gold))), `${query.id}: intended tutorial missing from top 10`);
      }
      return { passed: true, message: '32 tutorial fetches and 10 unfiltered discovery queries passed' };
    } finally { await client.close(); }
  },
}];
