#!/usr/bin/env node
/**
 * URL Validation Script
 * Tests random URLs from each documentation source to verify they're not 404
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { generateDocumentationUrl } from '../src/lib/url-generation/index.js';
import { getDocUrlConfig, getSourcePath } from '../src/lib/metadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const DATA_DIR = join(PROJECT_ROOT, 'dist', 'data');

interface TestResult {
  source: string;
  url: string;
  status: number;
  ok: boolean;
  error?: string;
  docTitle: string;
  relFile: string;
  responseTime: number;
}

interface LibraryBundle {
  id: string;
  name: string;
  description: string;
  docs: {
    id: string;
    title: string;
    description: string;
    snippetCount: number;
    relFile: string;
  }[];
}

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

async function loadIndex(): Promise<Record<string, LibraryBundle>> {
  const indexPath = join(DATA_DIR, 'index.json');
  if (!existsSync(indexPath)) {
    throw new Error(`Index file not found: ${indexPath}. Run 'npm run build' first.`);
  }
  
  const raw = await fs.readFile(indexPath, 'utf8');
  return JSON.parse(raw) as Record<string, LibraryBundle>;
}

function getRandomItems<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, array.length));
}

async function getDocumentContent(libraryId: string, relFile: string): Promise<string> {
  const sourcePath = getSourcePath(libraryId);
  if (!sourcePath) {
    throw new Error(`Unknown library ID: ${libraryId}`);
  }
  
  const fullPath = join(PROJECT_ROOT, 'sources', sourcePath, relFile);
  if (!existsSync(fullPath)) {
    return '# No content available';
  }
  
  return await fs.readFile(fullPath, 'utf8');
}

async function testUrl(url: string, timeout: number = 10000): Promise<{ status: number; ok: boolean; error?: string; responseTime: number }> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      method: 'HEAD', // Use HEAD to avoid downloading full content
      signal: controller.signal,
      headers: {
        'User-Agent': 'SAP-Docs-MCP-URL-Validator/1.0'
      }
    });
    
    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    
    return {
      status: response.status,
      ok: response.ok,
      responseTime
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    if (error.name === 'AbortError') {
      return {
        status: 0,
        ok: false,
        error: 'Timeout',
        responseTime
      };
    }
    
    return {
      status: 0,
      ok: false,
      error: error.message || 'Network error',
      responseTime
    };
  }
}

async function generateUrlForDoc(libraryId: string, doc: any): Promise<string | null> {
  const config = getDocUrlConfig(libraryId);
  if (!config) {
    console.warn(`${colors.yellow}⚠️  No URL config for ${libraryId}${colors.reset}`);
    return null;
  }
  
  try {
    const content = await getDocumentContent(libraryId, doc.relFile);
    return generateDocumentationUrl(libraryId, doc.relFile, content, config);
  } catch (error) {
    console.warn(`${colors.yellow}⚠️  Could not read content for ${doc.relFile}: ${error}${colors.reset}`);
    return null;
  }
}

async function validateSourceUrls(library: LibraryBundle, sampleSize: number = 5): Promise<TestResult[]> {
  console.log(`\n${colors.cyan}📚 Testing ${library.name} (${library.id})${colors.reset}`);
  console.log(`${colors.dim}   ${library.description}${colors.reset}`);
  
  // Get random sample of documents
  const randomDocs = getRandomItems(library.docs, sampleSize);
  console.log(`${colors.blue}   Selected ${randomDocs.length} random documents${colors.reset}`);
  
  const results: TestResult[] = [];
  const promises = randomDocs.map(async (doc) => {
    const url = await generateUrlForDoc(library.id, doc);
    
    if (!url) {
      return {
        source: library.id,
        url: 'N/A',
        status: 0,
        ok: false,
        error: 'Could not generate URL',
        docTitle: doc.title,
        relFile: doc.relFile,
        responseTime: 0
      };
    }
    
    console.log(`${colors.dim}   Testing: ${url}${colors.reset}`);
    const testResult = await testUrl(url);
    
    return {
      source: library.id,
      url,
      status: testResult.status,
      ok: testResult.ok,
      error: testResult.error,
      docTitle: doc.title,
      relFile: doc.relFile,
      responseTime: testResult.responseTime
    };
  });
  
  // Wait for all tests to complete
  const testResults = await Promise.all(promises);
  results.push(...testResults);
  
  // Display results for this source
  const successful = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  
  console.log(`${colors.bold}   Results: ${colors.green}✅ ${successful} OK${colors.reset}${colors.bold}, ${colors.red}❌ ${failed} Failed${colors.reset}`);
  
  // Show detailed results
  results.forEach(result => {
    const statusColor = result.ok ? colors.green : colors.red;
    const statusIcon = result.ok ? '✅' : '❌';
    const statusText = result.status > 0 ? result.status.toString() : (result.error || 'ERROR');
    
    console.log(`   ${statusIcon} ${statusColor}[${statusText}]${colors.reset} ${result.docTitle}`);
    console.log(`      ${colors.dim}${result.url}${colors.reset}`);
    if (!result.ok && result.error) {
      console.log(`      ${colors.red}Error: ${result.error}${colors.reset}`);
    }
    if (result.responseTime > 0) {
      console.log(`      ${colors.dim}Response time: ${result.responseTime}ms${colors.reset}`);
    }
  });
  
  return results;
}

async function generateSummaryReport(allResults: TestResult[]) {
  console.log(`\n${colors.bold}${colors.cyan}📊 SUMMARY REPORT${colors.reset}`);
  console.log(`${'='.repeat(60)}`);
  
  const totalTests = allResults.length;
  const successfulTests = allResults.filter(r => r.ok).length;
  const failedTests = allResults.filter(r => !r.ok).length;
  const successRate = totalTests > 0 ? ((successfulTests / totalTests) * 100).toFixed(1) : '0.0';
  
  console.log(`${colors.bold}Overall Results:${colors.reset}`);
  console.log(`  Total URLs tested: ${colors.bold}${totalTests}${colors.reset}`);
  console.log(`  Successful: ${colors.green}${successfulTests}${colors.reset}`);
  console.log(`  Failed: ${colors.red}${failedTests}${colors.reset}`);
  console.log(`  Success rate: ${colors.bold}${successRate}%${colors.reset}`);
  
  // Group by source
  const bySource = allResults.reduce((acc, result) => {
    if (!acc[result.source]) {
      acc[result.source] = { total: 0, successful: 0, failed: 0 };
    }
    acc[result.source].total++;
    if (result.ok) {
      acc[result.source].successful++;
    } else {
      acc[result.source].failed++;
    }
    return acc;
  }, {} as Record<string, { total: number; successful: number; failed: number }>);
  
  console.log(`\n${colors.bold}By Source:${colors.reset}`);
  Object.entries(bySource).forEach(([source, stats]) => {
    const rate = ((stats.successful / stats.total) * 100).toFixed(1);
    const rateColor = stats.successful === stats.total ? colors.green : 
                      stats.successful > stats.total / 2 ? colors.yellow : colors.red;
    console.log(`  ${source}: ${rateColor}${rate}%${colors.reset} (${colors.green}${stats.successful}${colors.reset}/${stats.total})`);
  });
  
  // Show failed URLs
  const failed = allResults.filter(r => !r.ok);
  if (failed.length > 0) {
    console.log(`\n${colors.bold}${colors.red}❌ Failed URLs:${colors.reset}`);
    failed.forEach(result => {
      console.log(`  ${colors.red}[${result.status || 'ERROR'}]${colors.reset} ${result.url}`);
      console.log(`    ${colors.dim}${result.docTitle} (${result.source})${colors.reset}`);
      if (result.error) {
        console.log(`    ${colors.red}${result.error}${colors.reset}`);
      }
    });
  }
  
  // Performance stats
  const responseTimes = allResults.filter(r => r.responseTime > 0).map(r => r.responseTime);
  if (responseTimes.length > 0) {
    const avgResponseTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
    const maxResponseTime = Math.max(...responseTimes);
    console.log(`\n${colors.bold}Performance:${colors.reset}`);
    console.log(`  Average response time: ${avgResponseTime}ms`);
    console.log(`  Slowest response: ${maxResponseTime}ms`);
  }
}

async function main() {
  console.log(`${colors.bold}${colors.blue}🔗 SAP Docs MCP - URL Validation Tool${colors.reset}`);
  console.log(`Testing random URLs from each documentation source...\n`);
  
  try {
    const index = await loadIndex();
    const sources = Object.values(index);
    
    console.log(`${colors.bold}Found ${sources.length} documentation sources:${colors.reset}`);
    sources.forEach(lib => {
      const hasUrlConfig = getDocUrlConfig(lib.id) !== null;
      const configStatus = hasUrlConfig ? `${colors.green}✅${colors.reset}` : `${colors.red}❌${colors.reset}`;
      console.log(`  ${configStatus} ${lib.name} (${lib.id}) - ${lib.docs.length} docs`);
    });
    
    const sourcesWithUrls = sources.filter(lib => getDocUrlConfig(lib.id) !== null);
    
    if (sourcesWithUrls.length === 0) {
      console.log(`${colors.red}❌ No sources have URL configuration. Cannot test URLs.${colors.reset}`);
      process.exit(1);
    }
    
    console.log(`\n${colors.bold}Testing URLs for ${sourcesWithUrls.length} sources with URL configuration...${colors.reset}`);
    
    // Test each source
    const allResults: TestResult[] = [];
    for (const library of sourcesWithUrls) {
      try {
        const results = await validateSourceUrls(library, 5);
        allResults.push(...results);
      } catch (error) {
        console.error(`${colors.red}❌ Error testing ${library.name}: ${error}${colors.reset}`);
      }
    }
    
    // Generate summary report
    await generateSummaryReport(allResults);
    
    // Exit with appropriate code
    const hasFailures = allResults.some(r => !r.ok);
    if (hasFailures) {
      console.log(`\n${colors.yellow}⚠️  Some URLs failed validation. Check the results above.${colors.reset}`);
      process.exit(1);
    } else {
      console.log(`\n${colors.green}🎉 All URLs validated successfully!${colors.reset}`);
      process.exit(0);
    }
    
  } catch (error) {
    console.error(`${colors.red}❌ Error: ${error}${colors.reset}`);
    process.exit(1);
  }
}

// Handle CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}

