// Generic semantic tests that use the harness server and docsSearch helper
import { parseSummaryText } from '../_utils/parseResults.js';

export default [
  {
    name: 'UI5 micro chart concept is discoverable',
    tool: 'search',
    query: 'UI.Chart #SpecificationWidthColumnChart',
    validate: async ({ docsSearch }) => {
      const summary = await docsSearch('UI.Chart #SpecificationWidthColumnChart');
      const txt = String(summary).toLowerCase();
      const ok = summary.includes('/sapui5/')
        && (txt.includes('chart') || txt.includes('micro'));
      return { passed: ok, message: ok ? '' : 'No UI5 chart content in results' };
    }
  },

  {
    name: 'Cloud SDK AI getting started is discoverable',
    tool: 'search',
    query: 'getting started with sap cloud sdk for ai',
    validate: async ({ docsSearch }) => {
      const summary = await docsSearch('getting started with sap cloud sdk for ai');
      const ok = summary.includes('cloud-sdk-ai')
        && /getting|start/i.test(summary);
      return { passed: ok, message: ok ? '' : 'No Cloud SDK AI getting started content' };
    }
  },

  {
    name: 'CAP enums query finds enums sections',
    tool: 'search',
    query: 'Use enums cql cap',
    validate: async ({ docsSearch }) => {
      const summary = await docsSearch('Use enums cql cap');
      const ok = summary.includes('/cap/') && /enum/i.test(summary);
      return { passed: ok, message: ok ? '' : 'No CAP enums content' };
    }
  },

  {
    name: 'ExtensionAPI is discoverable in UI5',
    tool: 'search',
    query: 'extensionAPI',
    validate: async ({ docsSearch }) => {
      const summary = await docsSearch('extensionAPI');
      const ok = summary.includes('/sapui5/') && /extension/i.test(summary);
      return { passed: ok, message: ok ? '' : 'No ExtensionAPI content' };
    }
  }
];