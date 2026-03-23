// Hybrid search quality tests — paraphrase queries that BM25 misses but embeddings catch.
// These are regression tests for the semantic search layer.
// Queries are designed so that the key concept is expressed differently from the indexed terms.
import { parseSummaryText } from '../_utils/parseResults.js';

export default [
  {
    name: 'permission check query finds ABAP authority-check docs',
    tool: 'search',
    query: 'how to check if a user has permission',
    validate: async ({ docsSearch }) => {
      const summary = await docsSearch('how to check if a user has permission');
      // BM25 gap: "permission" ≠ "authority-check" — embeddings should bridge this
      const ok = /abap-docs|abap-cheat|abap-platform|authority/i.test(summary);
      return {
        passed: ok,
        message: ok ? '' : 'Expected ABAP authority-check docs but got: ' + summary.substring(0, 200)
      };
    }
  },

  {
    name: 'data binding query finds UI5 binding docs',
    tool: 'search',
    query: 'connect UI control to backend data',
    validate: async ({ docsSearch }) => {
      const summary = await docsSearch('connect UI control to backend data');
      // BM25 gap: "connect" ≠ "binding" — embeddings should bridge this
      const ok = /sapui5|openui5|binding/i.test(summary);
      return {
        passed: ok,
        message: ok ? '' : 'Expected UI5 data binding docs but got: ' + summary.substring(0, 200)
      };
    }
  },

  {
    name: 'naming rules query finds SAP styleguides',
    tool: 'search',
    query: 'rules for naming variables and methods in ABAP',
    validate: async ({ docsSearch }) => {
      const summary = await docsSearch('rules for naming variables and methods in ABAP');
      // BM25 gap: "rules for naming" ≠ "naming convention / style guide"
      const ok = /styleguide|style-guide|abap-cheat|naming/i.test(summary);
      return {
        passed: ok,
        message: ok ? '' : 'Expected styleguide or naming convention docs but got: ' + summary.substring(0, 200)
      };
    }
  },

  {
    name: 'CAP entity query finds database definition docs',
    tool: 'search',
    query: 'define a database table structure in CAP',
    validate: async ({ docsSearch }) => {
      const summary = await docsSearch('define a database table structure in CAP');
      // BM25 gap: "database table structure" ≠ "entity definition"
      const ok = /\/cap\//i.test(summary);
      return {
        passed: ok,
        message: ok ? '' : 'Expected CAP docs but got: ' + summary.substring(0, 200)
      };
    }
  },

  {
    name: 'error handling external API query finds Cloud SDK exception docs',
    tool: 'search',
    query: 'handle failures when calling remote services',
    validate: async ({ docsSearch }) => {
      const summary = await docsSearch('handle failures when calling remote services');
      // BM25 gap: "failures when calling remote services" ≠ "error handling / exceptions"
      const ok = /cloud-sdk|cap|exception|error/i.test(summary);
      return {
        passed: ok,
        message: ok ? '' : 'Expected error-handling docs but got: ' + summary.substring(0, 200)
      };
    }
  }
];
