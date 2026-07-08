// SAP Cloud SDK (JavaScript) test cases
async function validateSourceResult(sourceId, query, expectedId) {
  const { search } = await import('../../../dist/src/lib/search.js');
  const results = await search(query, {
    k: 20,
    includeOnline: false,
    sources: [sourceId]
  });

  const ids = results.map(result => result.id);
  const found = ids.some(id => id === expectedId || id.startsWith(`${expectedId}#`));

  return {
    passed: found,
    message: found ? '' : `Expected ${expectedId} in source-filtered results. IDs: ${ids.join(', ')}`
  };
}

export default [
  {
    name: 'Cloud SDK JS remote debug guide present',
    tool: 'search',
    query: 'debug remote app cloud sdk',
    expectIncludes: ['/cloud-sdk-js/guides/debug-remote-app.mdx']
  },
  {
    name: 'Cloud SDK JS getting started',
    tool: 'search',
    query: 'getting started cloud sdk javascript',
    expectIncludes: ['/cloud-sdk-js/']
  },
  {
    name: 'Cloud SDK JS upgrade guide',
    validate: () => validateSourceResult(
      'cloud-sdk-js',
      'How to upgrade to version 4 of the SAP Cloud SDK for JavaScript',
      '/cloud-sdk-js/guides/upgrade-to-version-4'
    )
  }
];

