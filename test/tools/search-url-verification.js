// MCP Search URL Verification Test Cases
// Verifies that search results from the MCP server include proper documentation URLs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadAllowedUrlPrefixes() {
  const metadataPath = join(__dirname, '..', '..', 'src', 'metadata.json');
  const raw = readFileSync(metadataPath, 'utf8');
  const metadata = JSON.parse(raw);

  const prefixes = new Set();
  for (const source of metadata?.sources || []) {
    if (typeof source.baseUrl === 'string' && source.baseUrl.trim().length > 0) {
      const normalized = source.baseUrl.replace(/\/$/, '');
      prefixes.add(normalized);
    }
  }

  return prefixes;
}

const allowedPrefixes = loadAllowedUrlPrefixes();
const allowedPrefixList = Array.from(allowedPrefixes);

function extractUrls(text) {
  const regex = /🔗\s+(https?:\/\/[^\s]+)/g;
  const urls = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function isAllowedDocumentationUrl(url) {
  try {
    const normalized = url.replace(/\/$/, '');
    for (const prefix of allowedPrefixes) {
      if (normalized === prefix || normalized.startsWith(`${prefix}/`) || normalized.startsWith(`${prefix}#`)) {
        return true;
      }
    }
    return false;
  } catch (_) {
    return false;
  }
}

async function validateSourceFilteredSearch(sourceId, query) {
  const { search } = await import('../../dist/src/lib/search.js');
  const results = await search(query, {
    k: 8,
    includeOnline: false,
    sources: [sourceId]
  });

  if (!results.length) {
    return {
      passed: false,
      message: `No source-filtered results for ${sourceId} using query "${query}"`
    };
  }

  const invalid = results.filter(result => !String(result.id || '').startsWith(`/${sourceId}/`));
  if (invalid.length) {
    return {
      passed: false,
      message: `Source filter ${sourceId} returned non-matching IDs: ${invalid.map(result => result.id).join(', ')}`
    };
  }

  return { passed: true };
}

async function validateSourceFilteredUrl(sourceId, query, expectedUrlPattern) {
  const { search } = await import('../../dist/src/lib/search.js');
  const { getDocUrlConfig } = await import('../../dist/src/lib/metadata.js');
  const { generateDocumentationUrl, formatSearchResult } = await import('../../dist/src/lib/url-generation/index.js');

  const results = await search(query, {
    k: 8,
    includeOnline: false,
    sources: [sourceId]
  });

  if (!results.length) {
    return {
      passed: false,
      message: `No source-filtered results for ${sourceId} using query "${query}"`
    };
  }

  const formatted = results
    .map(result => formatSearchResult(result, 200, { generateDocumentationUrl, getDocUrlConfig }))
    .join('\n');
  const urls = extractUrls(formatted);
  const expectedPattern = expectedUrlPattern instanceof RegExp ? expectedUrlPattern : new RegExp(expectedUrlPattern);

  if (!urls.some(url => expectedPattern.test(url))) {
    return {
      passed: false,
      message: `Expected URL pattern ${expectedPattern} for ${sourceId}. URLs: ${urls.join(', ')}`
    };
  }

  return { passed: true };
}

async function validateVisibleSearchResult({ docsSearch, query, expectedSource, expectedUrlPattern }) {
  const text = await docsSearch(query);
  if (!text.includes(`/${expectedSource}/`)) {
    return {
      passed: false,
      message: `Expected /${expectedSource}/ to appear in results for "${query}".`
    };
  }

  const urls = extractUrls(text);
  const expectedPattern = expectedUrlPattern instanceof RegExp ? expectedUrlPattern : new RegExp(expectedUrlPattern);
  if (!urls.some(url => expectedPattern.test(url))) {
    return {
      passed: false,
      message: `Expected URL pattern ${expectedPattern} in results for "${query}". URLs: ${urls.join(', ')}`
    };
  }

  return { passed: true };
}

export default [
  {
    name: 'CAP CDS - Should include documentation URL',
    tool: 'search',
    query: 'cds query language',
    skipIfNoResults: true,
    expectIncludes: ['/cap/'],
    expectContains: ['🔗'], // Should contain URL link emoji
    expectUrlPattern: 'https://cap.cloud.sap/docs'
  },
  {
    name: 'Cloud SDK JS - Should include documentation URL',
    tool: 'search',
    query: 'cloud sdk javascript remote debugging',
    skipIfNoResults: true,
    expectIncludes: ['/cloud-sdk-js/'],
    expectContains: ['🔗'],
    expectUrlPattern: 'https://sap.github.io/cloud-sdk/docs/js'
  },
  {
    name: 'SAPUI5 - Should include documentation URL',
    tool: 'search',
    query: 'sapui5 button control',
    skipIfNoResults: true,
    expectIncludes: ['/sapui5/'],
    expectContains: ['🔗'],
    expectUrlPattern: 'https://ui5.sap.com'
  },
  {
    name: 'wdi5 - Should include documentation URL',
    tool: 'search',
    query: 'wdi5 locators testing',
    skipIfNoResults: true,
    expectIncludes: ['/wdi5/'],
    expectContains: ['🔗'],
    expectUrlPattern: 'https://ui5-community.github.io/wdi5'
  },
  {
    name: 'UI5 Tooling - Should include documentation URL',
    validate: () => validateSourceFilteredUrl(
      'ui5-tooling',
      'ui5 tooling build',
      /^https:\/\/ui5\.github\.io\/cli\//
    )
  },
  {
    name: 'sap.fe.test API generated source appears with pinned Open UX URL',
    validate: ({ docsSearch }) => validateVisibleSearchResult({
      docsSearch,
      query: 'sap.fe.test.api.DialogActions iConfirm iCancel',
      expectedSource: 'sap-fe-test-api',
      expectedUrlPattern: /^https:\/\/github\.com\/SAP\/open-ux-tools\/blob\/[a-f0-9]{40}\/packages\/fiori-docs-embeddings\/data_local\/sap_fe_test_api\.md#L\d+-L\d+/
    })
  },
  {
    name: 'Fiori Development Portal generated source appears with pinned Open UX URL',
    validate: ({ docsSearch }) => validateVisibleSearchResult({
      docsSearch,
      query: 'Upload Table MediaResource Attachments stream upload fiori elements',
      expectedSource: 'fiori-development-portal',
      expectedUrlPattern: /^https:\/\/github\.com\/SAP\/open-ux-tools\/blob\/[a-f0-9]{40}\/packages\/fiori-docs-embeddings\/data_local\/fiori_development_portal\.md#L\d+-L\d+/
    })
  },
  {
    name: 'Fiori Tools deployment docs appear with GitHub URL',
    validate: ({ docsSearch }) => validateVisibleSearchResult({
      docsSearch,
      query: 'deployment configuration ui5-deploy yaml fiori tools',
      expectedSource: 'btp-fiori-tools',
      expectedUrlPattern: /^https:\/\/github\.com\/SAP-docs\/btp-fiori-tools\/blob\/main\/docs\//
    })
  },
  {
    name: 'ux-ui5-tooling generated source appears with pinned Open UX URL',
    validate: ({ docsSearch }) => validateVisibleSearchResult({
      docsSearch,
      query: 'fiori-tools-appreload middleware ui5 yaml',
      expectedSource: 'ux-ui5-tooling',
      expectedUrlPattern: /^https:\/\/github\.com\/SAP\/open-ux-tools\/blob\/[a-f0-9]{40}\/packages\/fiori-docs-embeddings\/data_local\/ux-ui5-tooling-README\.md#L\d+-L\d+/
    })
  },
  {
    name: 'Fiori Tools OPA guide appears with tutorial GitHub URL',
    validate: ({ docsSearch }) => validateVisibleSearchResult({
      docsSearch,
      query: 'Write OPA Tests for an SAP Fiori Elements for OData V4 Application',
      expectedSource: 'fiori-tools-opa-guide',
      expectedUrlPattern: /^https:\/\/github\.com\/sap-tutorials\/Tutorials\/blob\/master\/tutorials\/fiori-tools-mockserver-opa-testing\//
    })
  },
  {
    name: 'Each new source returns at least one source-filtered result',
    async validate() {
      const checks = [
        ['btp-fiori-tools', 'deployment configuration'],
        ['fiori-tools-samples', 'ui5-deploy yaml'],
        ['fiori-tools-opa-guide', 'Write OPA Tests for an SAP Fiori Elements'],
        ['sap-ux-create', 'sap-ux create CLI Reference'],
        ['fiori-development-portal', 'Upload Table MediaResource Attachments'],
        ['sap-fe-test-api', 'sap.fe.test.api.DialogActions'],
        ['fiori-tools-suite', 'Commands in SAP Fiori Tools Command Palette'],
        ['fiori-opa5-docu', 'opaTest MUST have at least one Then assertion'],
        ['fiori-extension-instructions', 'Custom Column Link SimpleForm bindElement'],
        ['ux-ui5-tooling', 'fiori-tools-appreload middleware']
      ];

      for (const [sourceId, query] of checks) {
        const result = await validateSourceFilteredSearch(sourceId, query);
        if (!result.passed) {
          return result;
        }
      }

      return { passed: true };
    }
  },
  {
    name: 'Search results should have consistent format with excerpts',
    tool: 'search',
    query: 'button',
    skipIfNoResults: true,
    expectIncludes: ['Score:', '🔗', 'Use in fetch'],
    expectPattern: /⭐️\s+\*\*[^*]+\*\*\s+\(Score:\s+[\d.]+\)/
  },
  {
    name: 'All returned documentation URLs should be HTTPS and match known sources',
    async validate({ docsSearch }) {
      const response = await docsSearch('sap');
      if (/No results found/.test(response)) {
        return {
          skipped: true,
          message: 'no documentation results available to validate'
        };
      }
      const urls = extractUrls(response);

      if (!urls.length) {
        return {
          passed: false,
          message: 'No documentation URLs were found in the response.'
        };
      }

      const invalidUrls = urls.filter(url => !/^https:\/\//.test(url) || !isAllowedDocumentationUrl(url));

      if (invalidUrls.length) {
        return {
          passed: false,
          message: `Found URLs that are not allowed or not HTTPS: ${invalidUrls.join(', ')}`
        };
      }

      return { passed: true };
    }
  },
  {
    name: 'Metadata should expose base URLs for critical SAP documentation sources',
    async validate() {
      const requiredPrefixes = [
        'https://cap.cloud.sap',
        'https://sap.github.io/cloud-sdk',
        'https://ui5.sap.com',
        'https://ui5-community.github.io/wdi5'
      ];

      const missing = requiredPrefixes.filter(prefix => {
        return !allowedPrefixList.some(allowed => allowed === prefix || allowed.startsWith(prefix));
      });

      if (missing.length) {
        return {
          passed: false,
          message: `Missing required base URL prefixes in metadata: ${missing.join(', ')}`
        };
      }

      return { passed: true };
    }
  }
];
