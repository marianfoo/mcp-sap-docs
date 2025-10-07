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
    tool: 'search',
    query: 'ui5 tooling build',
    skipIfNoResults: true,
    expectIncludes: ['/ui5-tooling/'],
    expectContains: ['🔗'],
    expectUrlPattern: 'https://sap.github.io/ui5-tooling'
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
