// SAP Cloud SDK (JavaScript) test cases
export default [
  {
    name: 'Cloud SDK JS remote debug guide present',
    tool: 'sap_docs_search',
    query: 'debug remote app cloud sdk',
    expectIncludes: ['/cloud-sdk-js/guides/debug-remote-app.mdx']
  },
  {
    name: 'Cloud SDK JS getting started',
    tool: 'sap_docs_search',
    query: 'getting started cloud sdk javascript',
    expectIncludes: ['/cloud-sdk-js/']
  },
  {
    name: 'Cloud SDK JS upgrade guide',
    tool: 'sap_docs_search',
    query: 'cloud sdk javascript getting started tutorial',
    expectIncludes: ['/cloud-sdk-js/guides/upgrade-to-version-4.mdx']
  }
];


