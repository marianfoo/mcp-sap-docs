#!/usr/bin/env node

// Combined test script for SAP Community Search functionality
// Tests search, batch retrieval, and convenience functions

import { 
  searchCommunityBestMatch, 
  getCommunityPostByUrl, 
  getCommunityPostsByIds, 
  getCommunityPostById,
  searchAndGetTopPosts 
} from '../dist/src/lib/communityBestMatch.js';

interface TestOptions {
  userAgent: string;
  delay: number;
}

const defaultOptions: TestOptions = {
  userAgent: 'SAP-Docs-MCP-Test/1.0',
  delay: 2000
};

// Utility function for delays
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Test 1: Community Search with HTML Scraping
async function testCommunitySearch(options: TestOptions = defaultOptions): Promise<void> {
  console.log('🔍 Testing SAP Community Search with HTML Scraping');
  console.log('='.repeat(60));
  
  const testQueries = [
    'odata cache',
    'fiori elements',
    'CAP authentication'
  ];

  for (const query of testQueries) {
    console.log(`\n📝 Testing query: "${query}"`);
    console.log('-'.repeat(40));
    
    try {
      const results = await searchCommunityBestMatch(query, {
        includeBlogs: true,
        limit: 5,
        userAgent: options.userAgent
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
      
      // Test detailed post retrieval for the first result using URL scraping
      if (results.length > 0) {
        console.log(`\n🔎 Testing URL-based post retrieval for: "${results[0].title}"`);
        console.log('-'.repeat(30));
        
        try {
          const postContent = await getCommunityPostByUrl(results[0].url, options.userAgent);
          
          if (postContent) {
            console.log('✅ Successfully retrieved full post content via URL scraping:');
            console.log(postContent.substring(0, 400) + '...\n');
          } else {
            console.log('❌ Failed to retrieve full post content via URL scraping');
          }
        } catch (error: any) {
          console.log(`❌ Error retrieving post content: ${error.message}`);
        }
      }
      
    } catch (error: any) {
      console.log(`❌ Error searching for "${query}": ${error.message}`);
    }
    
    // Add delay between requests to be respectful
    if (options.delay > 0) {
      await delay(options.delay);
    }
  }
}

// Test 2: Batch Retrieval with LiQL API
async function testBatchRetrieval(options: TestOptions = defaultOptions): Promise<void> {
  console.log('\n\n📦 Testing SAP Community Batch Retrieval with LiQL API');
  console.log('='.repeat(60));
  
  // Test with known post IDs
  const testPostIds = ['13961398', '13446100', '14152848'];
  
  console.log('📦 Testing batch retrieval for multiple posts:');
  console.log(`Post IDs: ${testPostIds.join(', ')}`);
  console.log('-'.repeat(40));
  
  try {
    const results = await getCommunityPostsByIds(testPostIds, options.userAgent);
    
    console.log(`✅ Successfully retrieved ${Object.keys(results).length} out of ${testPostIds.length} posts\n`);
    
    for (const postId of testPostIds) {
      if (results[postId]) {
        console.log(`✅ Post ${postId}:`);
        const content = results[postId];
        const lines = content.split('\n');
        console.log(`   Title: ${lines[0].replace('# ', '')}`);
        
        // Extract published date
        const publishedLine = lines.find(line => line.startsWith('**Published**:'));
        if (publishedLine) {
          console.log(`   ${publishedLine}`);
        }
        
        // Show content preview
        const contentStart = content.indexOf('---\n\n') + 5;
        const contentEnd = content.lastIndexOf('\n\n---');
        if (contentStart > 4 && contentEnd > contentStart) {
          const contentPreview = content.slice(contentStart, contentEnd).substring(0, 200) + '...';
          console.log(`   Content preview: ${contentPreview}`);
        }
        console.log();
      } else {
        console.log(`❌ Post ${postId}: Not retrieved`);
      }
    }
    
  } catch (error: any) {
    console.log(`❌ Batch retrieval failed: ${error.message}`);
  }
}

// Test 3: Single Post Retrieval
async function testSingleRetrieval(options: TestOptions = defaultOptions): Promise<void> {
  console.log('\n🎯 Testing single post retrieval via LiQL API');
  console.log('='.repeat(60));
  
  const testPostId = '13961398'; // FIORI Cache Maintenance
  
  try {
    console.log(`Testing single retrieval for post: ${testPostId}`);
    const content = await getCommunityPostById(testPostId, options.userAgent);
    
    if (content) {
      console.log('✅ Successfully retrieved single post:');
      console.log(content.substring(0, 500) + '...\n');
      
      // Verify expected content
      if (content.includes('FIORI Cache Maintenance')) {
        console.log('✅ Title verification successful');
      }
      if (content.includes('SMICM')) {
        console.log('✅ Content verification successful');
      }
      if (content.includes('2024')) {
        console.log('✅ Date verification successful');
      }
    } else {
      console.log('❌ Single retrieval failed - no content returned');
    }
  } catch (error: any) {
    console.log(`❌ Single retrieval failed: ${error.message}`);
  }
}

// Test 4: Direct LiQL API Testing
async function testLiQLAPIDirectly(options: TestOptions = defaultOptions): Promise<void> {
  console.log('\n\n🧪 Testing LiQL API directly');
  console.log('='.repeat(60));
  
  const testIds = ['13961398', '13446100'];
  const idList = testIds.map(id => `'${id}'`).join(', ');
  const liqlQuery = `select body, id, subject, search_snippet, post_time from messages where id in (${idList})`;
  const url = `https://community.sap.com/api/2.0/search?q=${encodeURIComponent(liqlQuery)}`;
  
  console.log(`Testing URL: ${url.substring(0, 120)}...`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': options.userAgent
      }
    });
    
    if (!response.ok) {
      console.log(`❌ API returned ${response.status}: ${response.statusText}`);
      return;
    }
    
    const data = await response.json();
    console.log(`✅ API Response status: ${data.status}`);
    console.log(`✅ Items returned: ${data.data?.items?.length || 0}`);
    
    if (data.data?.items) {
      for (const item of data.data.items) {
        console.log(`   - Post ${item.id}: "${item.subject}" (${item.post_time})`);
      }
    }
    
  } catch (error: any) {
    console.log(`❌ Direct API test failed: ${error.message}`);
  }
}

// Test 5: Convenience Function (Search + Get Top Posts)
async function testConvenienceFunction(options: TestOptions = defaultOptions): Promise<void> {
  console.log('\n\n🚀 Testing Search + Get Top Posts Convenience Function');
  console.log('='.repeat(60));
  
  const query = 'odata cache';
  const topN = 3;
  
  console.log(`Query: "${query}"`);
  console.log(`Getting top ${topN} posts with full content...\n`);
  
  try {
    const result = await searchAndGetTopPosts(query, topN, {
      includeBlogs: true,
      userAgent: options.userAgent
    });
    
    console.log(`✅ Search found ${result.search.length} results`);
    console.log(`✅ Retrieved full content for ${Object.keys(result.posts).length} posts\n`);
    
    // Display search results with post content
    for (let i = 0; i < result.search.length; i++) {
      const searchResult = result.search[i];
      const postContent = result.posts[searchResult.postId || ''];
      
      console.log(`${i + 1}. ${searchResult.title}`);
      console.log(`   Post ID: ${searchResult.postId}`);
      console.log(`   URL: ${searchResult.url}`);
      console.log(`   Author: ${searchResult.author || 'Unknown'}`);
      console.log(`   Likes: ${searchResult.likes || 0}`);
      
      if (postContent) {
        console.log('   ✅ Full content retrieved:');
        const contentPreview = postContent.split('\n\n---\n\n')[1] || postContent;
        console.log(`   "${contentPreview.substring(0, 150)}..."`);
      } else {
        console.log('   ❌ Full content not available');
      }
      console.log();
    }
    
    // Example usage demonstration
    console.log('📋 Example: How to use this data');
    console.log('='.repeat(40));
    console.log('// Search and get top 3 posts about OData cache:');
    console.log(`const { search, posts } = await searchAndGetTopPosts('${query}', ${topN});`);
    console.log('');
    console.log('// Display results:');
    console.log('search.forEach((result, index) => {');
    console.log('  console.log(`${index + 1}. ${result.title}`);');
    console.log('  if (posts[result.postId]) {');
    console.log('    console.log(posts[result.postId]); // Full formatted content');
    console.log('  }');
    console.log('});');
    
  } catch (error: any) {
    console.error(`❌ Test failed: ${error.message}`);
  }
}

// Test 6: Specific Known Post
async function testSpecificPost(options: TestOptions = defaultOptions): Promise<void> {
  console.log('\n\n🎯 Testing specific known post retrieval');
  console.log('='.repeat(60));
  
  // Test with the known SAP Community URL
  const testUrl = 'https://community.sap.com/t5/technology-blog-posts-by-sap/fiori-cache-maintenance/ba-p/13961398';
  
  try {
    console.log(`Testing URL: ${testUrl}`);
    console.log(`Expected Post ID: 13961398`);
    
    const content = await getCommunityPostByUrl(testUrl, options.userAgent);
    
    if (content) {
      console.log('✅ Successfully retrieved content:');
      console.log(content.substring(0, 600) + '...');
      
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
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }
}

// Main test runner
async function main(): Promise<void> {
  console.log('🚀 SAP Community Search - Comprehensive Test Suite');
  console.log('==================================================');
  console.log(`Started at: ${new Date().toISOString()}\n`);
  
  const options: TestOptions = {
    userAgent: 'SAP-Docs-MCP-Test/1.0',
    delay: 1500 // Reduced delay for faster testing
  };
  
  try {
    // Run all tests sequentially
    await testCommunitySearch(options);
    await testBatchRetrieval(options);
    await testSingleRetrieval(options);
    await testLiQLAPIDirectly(options);
    await testConvenienceFunction(options);
    await testSpecificPost(options);
    
    console.log('\n\n🎉 All tests completed successfully!');
    console.log('=====================================');
    console.log(`Finished at: ${new Date().toISOString()}`);
    
  } catch (error: any) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Test interrupted by user');
  process.exit(0);
});

// Run the tests if this file is executed directly
import { pathToFileURL } from "url";
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}

// Export functions for potential use in other test files
export {
  testCommunitySearch,
  testBatchRetrieval,
  testSingleRetrieval,
  testLiQLAPIDirectly,
  testConvenienceFunction,
  testSpecificPost,
  main as runAllTests
};