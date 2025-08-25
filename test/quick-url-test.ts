#!/usr/bin/env node
/**
 * Quick URL Test - Simple version for testing a few URLs from specific sources
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

// Simple colors
const c = {
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', 
  blue: '\x1b[34m', bold: '\x1b[1m', reset: '\x1b[0m'
};

async function loadIndex() {
  const indexPath = join(DATA_DIR, 'index.json');
  if (!existsSync(indexPath)) {
    throw new Error(`Index not found. Run: npm run build`);
  }
  
  const raw = await fs.readFile(indexPath, 'utf8');
  return JSON.parse(raw);
}

async function getDocContent(libraryId: string, relFile: string): Promise<string> {
  const sourcePath = getSourcePath(libraryId);
  if (!sourcePath) return '# No content';
  
  const fullPath = join(PROJECT_ROOT, 'sources', sourcePath, relFile);
  if (!existsSync(fullPath)) return '# No content';
  
  return await fs.readFile(fullPath, 'utf8');
}

async function testUrl(url: string): Promise<{ok: boolean, status: number, time: number}> {
  const start = Date.now();
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return { ok: response.ok, status: response.status, time: Date.now() - start };
  } catch {
    return { ok: false, status: 0, time: Date.now() - start };
  }
}

async function quickTest(sourceFilter?: string, count: number = 3) {
  console.log(`${c.bold}${c.blue}🔗 Quick URL Test${c.reset}\n`);
  
  const index = await loadIndex();
  const sources = Object.values(index).filter((lib: any) => {
    if (sourceFilter) {
      return lib.id.includes(sourceFilter) || lib.name.toLowerCase().includes(sourceFilter.toLowerCase());
    }
    return getDocUrlConfig(lib.id) !== null; // Only test sources with URL configs
  });
  
  if (sources.length === 0) {
    console.log(`${c.red}No sources found matching "${sourceFilter}"${c.reset}`);
    return;
  }
  
  console.log(`Testing ${count} URLs from ${sources.length} source(s)...\n`);
  
  for (const lib of sources) {
    console.log(`${c.bold}📚 ${lib.name}${c.reset}`);
    
    const randomDocs = lib.docs
      .sort(() => 0.5 - Math.random())
      .slice(0, count);
    
    for (const doc of randomDocs) {
      try {
        const config = getDocUrlConfig(lib.id);
        if (!config) {
          console.log(`${c.yellow}  ⚠️  No URL config for ${lib.id}${c.reset}`);
          continue;
        }
        
        const content = await getDocContent(lib.id, doc.relFile);
        const url = generateDocumentationUrl(lib.id, doc.relFile, content, config);
        
        if (!url) {
          console.log(`${c.yellow}  ❌ Could not generate URL for: ${doc.title}${c.reset}`);
          continue;
        }
        
        const result = await testUrl(url);
        const statusColor = result.ok ? c.green : c.red;
        const icon = result.ok ? '✅' : '❌';
        
        console.log(`  ${icon} ${statusColor}[${result.status}]${c.reset} ${doc.title.substring(0, 50)}${doc.title.length > 50 ? '...' : ''}`);
        console.log(`     ${c.blue}${url}${c.reset}`);
        console.log(`     ${result.time}ms\n`);
        
      } catch (error) {
        console.log(`  ${c.red}❌ Error testing ${doc.title}: ${error}${c.reset}\n`);
      }
    }
  }
}

// CLI usage
const args = process.argv.slice(2);
const sourceFilter = args[0];
const count = parseInt(args[1]) || 3;

console.log(`${c.bold}Usage:${c.reset} npx tsx test/quick-url-test.ts [source-filter] [count]`);
console.log(`${c.bold}Examples:${c.reset}`);
console.log(`  npx tsx test/quick-url-test.ts cloud-sdk 2    # Test 2 URLs from Cloud SDK sources`);
console.log(`  npx tsx test/quick-url-test.ts cap 5          # Test 5 URLs from CAP`);
console.log(`  npx tsx test/quick-url-test.ts ui5 1          # Test 1 URL from UI5 sources`);
console.log(`  npx tsx test/quick-url-test.ts                # Test 3 URLs from all sources\n`);

quickTest(sourceFilter, count).catch(console.error);

