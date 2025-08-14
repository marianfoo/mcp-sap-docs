// Simple smoke test for critical search behaviors
import { startServerHttp, waitForStatus, stopServer, docsSearch } from '../_utils/httpClient.js';
import { parseSummaryText } from '../_utils/parseResults.js';
import assert from 'node:assert/strict';

const QUERIES = [
  { q: 'UI5 column micro chart', expect: /Column Micro Chart|Micro.*Chart/i },
  { q: 'CAP CQL enums',          expect: /Use enums|CQL/i },
  { q: 'Cloud SDK AI getting started', expect: /getting started|AI SDK/i },
  { q: 'ExtensionAPI',           expect: /ExtensionAPI/i },
];

(async () => {
  const child = startServerHttp();
  try {
    await waitForStatus();
    for (const { q, expect } of QUERIES) {
      const summary = await docsSearch(q);
      const { items, totalCandidates } = parseSummaryText(summary);
      assert.ok(items.length > 0, `no results for "${q}"`);
      assert.ok(expect.test(summary), `expected hint missing in "${q}"`);
      // Assert we're in BM25-only mode
      assert.ok(items.every(i => i.rerankerScore === 0), 'reranker not zero');
    }
    console.log('✅ Smoke tests passed');
  } finally {
    await stopServer(child);
  }
})();
