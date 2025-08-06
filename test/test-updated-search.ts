#!/usr/bin/env node

// Test the updated community search function that returns full content

import { searchCommunity } from '../dist/src/lib/localDocs.js';

async function testUpdatedCommunitySearch() {
  console.log('🔍 Testing Updated Community Search (with full content)');
  console.log('='.repeat(60));
  
  const query = 'odata cache';
  
  try {
    console.log(`\n📝 Testing query: "${query}"`);
    console.log('Expecting full content from top 3 posts...\n');
    
    const result = await searchCommunity(query);
    
    if (result.results.length === 0) {
      console.log('❌ No results returned');
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
      return;
    }
    
    console.log(`✅ Got ${result.results.length} result(s)`);
    
    for (const res of result.results) {
      console.log(`\nTitle: ${res.title}`);
      console.log(`Total snippets: ${res.totalSnippets}`);
      console.log(`Source: ${res.source}`);
      console.log(`Content length: ${res.description.length} characters`);
      
      // Show first 500 characters of the response
      console.log('\nContent preview:');
      console.log('-'.repeat(40));
      console.log(res.description.substring(0, 800) + '...');
      
      // Check if it contains full post content (should have markdown headers)
      if (res.description.includes('# ') && res.description.includes('**Source**: SAP Community Blog Post')) {
        console.log('\n✅ Contains full post content with proper formatting');
      } else {
        console.log('\n⚠️ Does not contain expected full post format');
      }
      
      // Count how many posts are included
      const postCount = (res.description.match(/# /g) || []).length;
      console.log(`✅ Contains ${postCount} full blog posts`);
    }
    
  } catch (error: any) {
    console.error(`❌ Test failed: ${error.message}`);
  }
}

testUpdatedCommunitySearch().then(() => {
  console.log('\n✅ Updated community search test completed!');
}).catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});