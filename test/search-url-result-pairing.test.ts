import { describe, expect, it } from 'vitest';
import {
  extractVisibleResults,
  hasMatchingVisibleResult
} from './tools/search-url-verification.js';

const formattedResults = `⭐️ **/btp-fiori-tools/deploy/configuration** (Score: 0.03)
   Deployment configuration
   🔗 https://github.com/SAP-docs/btp-fiori-tools/blob/main/docs/deploy.md
   Use in fetch

⭐️ **/fiori-tools-samples/V4/apps/travel/ui5-deploy.yaml** (Score: 0.02)
   Travel deployment configuration
   🔗 https://github.com/SAP-samples/fiori-tools-samples/blob/main/V4/apps/travel/ui5-deploy.yaml?plain=1
   Use in fetch
`;

describe('visible search-result URL pairing', () => {
  it('extracts each result with its own URL', () => {
    expect(extractVisibleResults(formattedResults)).toEqual([
      {
        id: '/btp-fiori-tools/deploy/configuration',
        url: 'https://github.com/SAP-docs/btp-fiori-tools/blob/main/docs/deploy.md'
      },
      {
        id: '/fiori-tools-samples/V4/apps/travel/ui5-deploy.yaml',
        url: 'https://github.com/SAP-samples/fiori-tools-samples/blob/main/V4/apps/travel/ui5-deploy.yaml?plain=1'
      }
    ]);
  });

  it('requires the expected source and URL pattern on the same result', () => {
    expect(hasMatchingVisibleResult(formattedResults, [{
      source: 'btp-fiori-tools',
      urlPattern: /^https:\/\/github\.com\/SAP-docs\/btp-fiori-tools\//
    }])).toBe(true);

    expect(hasMatchingVisibleResult(formattedResults, [{
      source: 'btp-fiori-tools',
      urlPattern: /^https:\/\/github\.com\/SAP-samples\/fiori-tools-samples\//
    }])).toBe(false);
  });
});
