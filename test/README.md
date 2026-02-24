# Test Directory Guide

This file documents the test commands that exist in the current project state.

## Current Test Commands

```bash
# Core URL/prompt/feature-matrix tests
npm run test:url-generation

# Full integration harness (build + runtime tests)
npm run test:integration

# Integration subset focused on URL verification
npm run test:integration:urls

# Software Heroes focused tests
npm run test:software-heroes

# Smoke tests
npm run test:smoke

# Community search script
npm run test:community

# Community search MCP tool integration test (starts local server)
npm run test:community-tool

# URL status check script
npm run test:urls:status
```

## Notes

- `npm run test` runs `test:url-generation` and `test:integration`.
- Variant-dependent behavior should be validated by running build/index flows with both:
  - `MCP_VARIANT=sap-docs`
  - `MCP_VARIANT=abap`

## Typical Local Validation Sequence

```bash
npm run build:tsc
npm run test:url-generation
MCP_VARIANT=sap-docs npm run build:index
MCP_VARIANT=abap npm run build:index
npm run test:integration
```

## Files in This Directory

- `test/comprehensive-url-generation.test.ts`
- `test/prompts.test.ts`
- `test/software-heroes-afm.test.ts`
- `test/software-heroes-content-search.test.ts`
- `test/tools/run-tests.js`
- `test/tools/search.smoke.js`
- `test/tools/community-search-tool.mjs`

For architecture and requirement mapping, see:

- `docs/ARCHITECTURE.md`
- `docs/TESTS.md`
- `docs/UPSTREAM-ONE-WAY-SYNC-IMPLEMENTATION.md`
