#!/usr/bin/env tsx
// Simple search test script - can be run with: npx tsx test-search.ts [keyword]
import { searchLibraries } from './dist/src/lib/localDocs.js';

async function testSearch() {
  // Get search keyword from command line arguments or use default
  const keyword = process.argv[2] || 'wizard';
  
  console.log(`🔍 Testing search for: "${keyword}"\n`);
  
  try {
    const startTime = Date.now();
    const result = await searchLibraries(keyword);
    const endTime = Date.now();
    
    console.log(`⏱️  Search completed in ${endTime - startTime}ms\n`);
    
    if (result.results.length > 0) {
      console.log('✅ Search Results:');
      console.log('='.repeat(50));
      console.log(result.results[0].description);
      console.log('='.repeat(50));
      
      console.log(`\n📊 Summary:`);
      console.log(`- Total snippets: ${result.results[0].totalSnippets || 0}`);
      console.log(`- Result length: ${result.results[0].description.length} characters`);
      
    } else {
      console.log('❌ No results found');
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Search failed:', error);
    process.exit(1);
  }
}

// Usage examples
if (process.argv.length === 2) {
  console.log(`
🎯 SAP Docs Search Test

Usage: npx tsx test-search.ts [keyword]

Examples:
  npx tsx test-search.ts wizard
  npx tsx test-search.ts "cds entity"
  npx tsx test-search.ts "wdi5 testing"
  npx tsx test-search.ts button
  npx tsx test-search.ts annotation
  npx tsx test-search.ts service
  
Running with default keyword "wizard"...
`);
}

testSearch().catch(console.error);