#!/usr/bin/env node

// Test script for the new community search functionality
// Tests both search and detailed post retrieval

import { searchCommunityBestMatch, getCommunityPostByUrl } from './dist/src/lib/communityBestMatch.js';

async function testCommunitySearch() {
  console.log('🔍 Testing SAP Community Search with HTML Scraping\n');
  
  const testQueries = [
    'odata cache',
    // 'CAP authentication',
    // 'odata binding',
    // 'fiori elements'
  ];

  for (const query of testQueries) {
    console.log(`\n📝 Testing query: "${query}"`);
    console.log('=' .repeat(50));
    
    try {
      const results = await searchCommunityBestMatch(query, {
        includeBlogs: true,
        limit: 5,
        userAgent: 'SAP-Docs-MCP-Test/1.0'
      });
      
      if (results.length === 0) {
        console.log('❌ No results found');
        continue;
      }
      
      console.log(`✅ Found ${results.length} results:`);
      
      results.forEach((result, index) => {
        console.log(`\n${index + 1}. ${result.title}`);
        console.log(`   URL: ${result.url}`);
        console.log(`   Author: ${result.author || 'Unknown'}`);
        console.log(`   Published: ${result.published || 'Unknown'}`);
        console.log(`   Likes: ${result.likes || 0}`);
        console.log(`   Snippet: ${result.snippet ? result.snippet.substring(0, 100) + '...' : 'No snippet'}`);
        console.log(`   Tags: ${result.tags?.join(', ') || 'None'}`);
        console.log(`   Post ID: ${result.postId || 'Not extracted'}`);
        
        // Verify post ID extraction
        if (result.postId) {
          console.log(`   ✅ Post ID extracted: ${result.postId}`);
        } else {
          console.log(`   ⚠️ Post ID not extracted from URL: ${result.url}`);
        }
      });
      
      // Test detailed post retrieval for the first result
      if (results.length > 0) {
        console.log(`\n🔎 Testing detailed post retrieval for: "${results[0].title}"`);
        console.log('-'.repeat(50));
        
        try {
          const postContent = await getCommunityPostByUrl(results[0].url, 'SAP-Docs-MCP-Test/1.0');
          
          if (postContent) {
            console.log('✅ Successfully retrieved full post content:');
            console.log(postContent.substring(0, 500) + '...\n');
          } else {
            console.log('❌ Failed to retrieve full post content');
          }
        } catch (error) {
          console.log(`❌ Error retrieving post content: ${error.message}`);
        }
      }
      
    } catch (error) {
      console.log(`❌ Error searching for "${query}": ${error.message}`);
    }
    
    // Add delay between requests to be respectful
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

async function testSpecificPost() {
  console.log('\n🎯 Testing specific post retrieval');
  console.log('=' .repeat(50));
  
  // Test with the known SAP Community URL from your example
  const testUrl = 'https://community.sap.com/t5/technology-blog-posts-by-sap/fiori-cache-maintenance/ba-p/13961398';
  
  try {
    console.log(`Testing URL: ${testUrl}`);
    console.log(`Expected Post ID: 13961398`);
    
    const content = await getCommunityPostByUrl(testUrl, 'SAP-Docs-MCP-Test/1.0');
    
    if (content) {
      console.log('✅ Successfully retrieved content:');
      console.log(content.substring(0, 800) + '...');
      
      // Verify the content contains expected elements
      if (content.includes('FIORI Cache Maintenance')) {
        console.log('✅ Title extraction successful');
      }
      if (content.includes('MarkNed')) {
        console.log('✅ Author extraction successful');
      }
      if (content.includes('SMICM')) {
        console.log('✅ Content extraction successful');
      }
    } else {
      console.log('❌ No content retrieved');
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

async function main() {
  console.log('🚀 Starting SAP Community Search Tests');
  console.log('=====================================');
  
  try {
    await testCommunitySearch();
    await testSpecificPost();
    
    console.log('\n✅ All tests completed!');
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Test interrupted by user');
  process.exit(0);
});

// Run the tests
main().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});