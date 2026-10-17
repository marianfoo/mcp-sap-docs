// Simple smoke test for critical search behaviors
import { startServerHttp, waitForStatus, stopServer, docsSearch } from '../_utils/httpClient.js';
import { parseSummaryText } from '../_utils/parseResults.js';
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const QUERIES = [
  { q: 'UI5 column micro chart', expect: /Column Micro Chart|Micro.*Chart/i },
  { q: 'CAP CQL enums',          expect: /Use enums|CQL/i },
  { q: 'Cloud SDK AI getting started', expect: /getting started|AI SDK/i },
  { q: 'ExtensionAPI',           expect: /ExtensionAPI/i },
];

const tests = QUERIES.map(({ q, expect }) => ({
  name: `Smoke: ${q}`,
  validate: async ({ docsSearch }) => {
    const summary = await docsSearch(q);
    const { items } = parseSummaryText(summary);
    assert.ok(items.length > 0, `no results for "${q}"`);
    assert.ok(expect.test(summary), `expected hint missing in "${q}"`);
    assert.ok(items.every(i => i.rerankerScore === 0), 'reranker not zero');
    return { passed: true };
  },
}));

export default tests;

// Imports supply cases to the shared runner; only the standalone command owns a server.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const child = startServerHttp();
  try {
    await waitForStatus();
    for (const test of tests) {
      await test.validate({ docsSearch });
    }
    console.log('✅ Smoke tests passed');
  } finally {
    await stopServer(child);
  }
}
