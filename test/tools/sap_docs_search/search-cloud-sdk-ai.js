// SAP Cloud SDK for AI test cases
export default [
  {
    name: 'AI SDK error handling doc present',
    tool: 'sap_docs_search',
    query: 'how to access Error Information in the cloud sdk for ai',
    expectIncludes: ['/cloud-sdk-ai-js/error-handling.mdx']
  },
  {
    name: 'AI SDK getting started guide',
    tool: 'sap_docs_search', 
    query: 'getting started with sap cloud sdk for ai',
    expectIncludes: ['/cloud-sdk-ai-js/']
  },
  {
    name: 'AI SDK FAQ section',
    tool: 'sap_docs_search',
    query: 'cloud sdk ai frequently asked questions',
    expectIncludes: ['/cloud-sdk-ai-java/faq.mdx']
  }
];


