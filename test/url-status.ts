#!/usr/bin/env node
/**
 * URL Status - Shows which sources have URL generation configured
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { getDocUrlConfig, getSourcePath, getMetadata } from '../src/lib/metadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const DATA_DIR = join(PROJECT_ROOT, 'dist', 'data');

// Colors
const c = {
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', 
  blue: '\x1b[34m', bold: '\x1b[1m', reset: '\x1b[0m', dim: '\x1b[2m'
};

async function loadIndex() {
  const indexPath = join(DATA_DIR, 'index.json');
  if (!existsSync(indexPath)) {
    throw new Error(`Index not found. Run: npm run build`);
  }
  
  const raw = await fs.readFile(indexPath, 'utf8');
  return JSON.parse(raw);
}

async function showUrlStatus() {
  console.log(`${c.bold}${c.blue}🔗 URL Generation Status${c.reset}\n`);
  
  try {
    const index = await loadIndex();
    const metadata = getMetadata();
    const sources = Object.values(index);
    
    console.log(`Found ${sources.length} documentation sources:\n`);
    
    // Group sources by status
    const withUrls: any[] = [];
    const withoutUrls: any[] = [];
    
    sources.forEach((lib: any) => {
      const config = getDocUrlConfig(lib.id);
      if (config) {
        withUrls.push({ lib, config });
      } else {
        withoutUrls.push(lib);
      }
    });
    
    // Show sources with URL generation
    if (withUrls.length > 0) {
      console.log(`${c.bold}${c.green}✅ Sources with URL generation (${withUrls.length}):${c.reset}`);
      withUrls.forEach(({ lib, config }) => {
        console.log(`  ${c.green}✅${c.reset} ${c.bold}${lib.name}${c.reset} (${lib.id})`);
        console.log(`     ${c.dim}📄 ${lib.docs.length} documents${c.reset}`);
        console.log(`     ${c.dim}🌐 ${config.baseUrl}${c.reset}`);
        console.log(`     ${c.dim}📋 Pattern: ${config.pathPattern}${c.reset}`);
        console.log(`     ${c.dim}⚙️  Anchor style: ${config.anchorStyle}${c.reset}`);
        console.log();
      });
    }
    
    // Show sources without URL generation
    if (withoutUrls.length > 0) {
      console.log(`${c.bold}${c.red}❌ Sources without URL generation (${withoutUrls.length}):${c.reset}`);
      withoutUrls.forEach((lib: any) => {
        console.log(`  ${c.red}❌${c.reset} ${c.bold}${lib.name}${c.reset} (${lib.id})`);
        console.log(`     ${c.dim}📄 ${lib.docs.length} documents${c.reset}`);
        console.log(`     ${c.dim}💡 Needs baseUrl, pathPattern, and anchorStyle in metadata.json${c.reset}`);
        console.log();
      });
    }
    
    // Show URL generation handlers status
    console.log(`${c.bold}${c.blue}🔧 URL Generation Handlers:${c.reset}`);
    
    const handlers = [
      { pattern: '/cloud-sdk-*', description: 'Cloud SDK (JS/Java/AI variants)', status: 'implemented' },
      { pattern: '/sapui5', description: 'SAPUI5 topic-based URLs', status: 'implemented' },
      { pattern: '/openui5-*', description: 'OpenUI5 API & samples', status: 'implemented' },
      { pattern: '/cap', description: 'CAP docsify-style URLs', status: 'implemented' },
      { pattern: '/wdi5', description: 'wdi5 testing framework', status: 'implemented' },
      { pattern: '/ui5-tooling', description: 'UI5 Tooling (fallback)', status: 'fallback' },
      { pattern: '/ui5-webcomponents', description: 'UI5 Web Components (fallback)', status: 'fallback' },
      { pattern: '/cloud-mta-build-tool', description: 'MTA Build Tool (fallback)', status: 'fallback' }
    ];
    
    handlers.forEach(handler => {
      const statusIcon = handler.status === 'implemented' ? `${c.green}✅` : `${c.yellow}⚠️ `;
      const statusText = handler.status === 'implemented' ? 'Specialized handler' : 'Generic fallback';
      
      console.log(`  ${statusIcon}${c.reset} ${c.bold}${handler.pattern}${c.reset}`);
      console.log(`     ${c.dim}${handler.description}${c.reset}`);
      console.log(`     ${c.dim}${statusText}${c.reset}`);
      console.log();
    });
    
    // Summary
    console.log(`${c.bold}${c.blue}📊 Summary:${c.reset}`);
    console.log(`  Sources with URL generation: ${c.green}${withUrls.length}${c.reset}/${sources.length}`);
    console.log(`  Specialized handlers: ${c.green}5${c.reset} (Cloud SDK, UI5, CAP, wdi5)`);
    console.log(`  Fallback handlers: ${c.yellow}3${c.reset} (Tooling, Web Components, MTA)`);
    
    const coverage = Math.round((withUrls.length / sources.length) * 100);
    const coverageColor = coverage > 80 ? c.green : coverage > 60 ? c.yellow : c.red;
    console.log(`  URL generation coverage: ${coverageColor}${coverage}%${c.reset}`);
    
  } catch (error) {
    console.error(`${c.red}Error: ${error}${c.reset}`);
  }
}

showUrlStatus();

