// MCP Search URL Verification Test Cases
// Verifies that search results from the MCP server include proper documentation URLs

export default [
  {
    name: 'CAP CDS - Should include documentation URL',
    tool: 'search',
    query: 'cds query language',
    expectIncludes: ['/cap/'],
    expectContains: ['🔗'], // Should contain URL link emoji
    expectUrlPattern: 'https://cap.cloud.sap/docs'
  },
  {
    name: 'Cloud SDK JS - Should include documentation URL',
    tool: 'search', 
    query: 'cloud sdk javascript remote debugging',
    expectIncludes: ['/cloud-sdk-js/'],
    expectContains: ['🔗'],
    expectUrlPattern: 'https://sap.github.io/cloud-sdk/docs/js'
  },
  {
    name: 'SAPUI5 - Should include documentation URL',
    tool: 'search',
    query: 'sapui5 button control',
    expectIncludes: ['/sapui5/'],
    expectContains: ['🔗'],
    expectUrlPattern: 'https://ui5.sap.com'
  },
  {
    name: 'wdi5 - Should include documentation URL', 
    tool: 'search',
    query: 'wdi5 locators testing',
    expectIncludes: ['/wdi5/'],
    expectContains: ['🔗'],
    expectUrlPattern: 'https://ui5-community.github.io/wdi5'
  },
  {
    name: 'UI5 Tooling - Should include documentation URL',
    tool: 'search',
    query: 'ui5 tooling build',
    expectIncludes: ['/ui5-tooling/'],
    expectContains: ['🔗'],
    expectUrlPattern: 'https://sap.github.io/ui5-tooling'
  },
  {
    name: 'Search results should have consistent format with excerpts',
    tool: 'search',
    query: 'button',
    expectIncludes: ['Score:', '🔗', 'Use in fetch'],
    expectPattern: /⭐️\s+\*\*[^*]+\*\*\s+\(Score:\s+[\d.]+\)/
  }
];
