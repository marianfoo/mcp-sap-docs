#!/usr/bin/env node

// Simple script to check the version of deployed MCP server
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 SAP Docs MCP Version Check');
console.log('================================');

// Check local package.json version
try {
  const packagePath = join(__dirname, '../package.json');
  const packageInfo = JSON.parse(readFileSync(packagePath, 'utf8'));
  console.log(`📦 Package Version: ${packageInfo.version}`);
} catch (error) {
  console.log('❌ Could not read package.json');
}

// Try to check running servers
console.log('\n🌐 Checking Running Servers:');

const servers = [
  { name: 'HTTP Server', port: 3001, path: '/status' },
  { name: 'Streamable HTTP', port: 3122, path: '/health' }
];

for (const server of servers) {
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}${server.path}`);
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ ${server.name}: v${data.version || 'unknown'} (port ${server.port})`);
    } else {
      console.log(`   ❌ ${server.name}: Server error ${response.status}`);
    }
  } catch (error) {
    console.log(`   ⚠️  ${server.name}: Not responding (port ${server.port})`);
  }
}

console.log('\n✅ Version check complete');
