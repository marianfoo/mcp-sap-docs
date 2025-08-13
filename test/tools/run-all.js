// Simple runner to execute all JS tests under test/tools/** (ESM)
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServerHttp, waitForStatus, stopServer, docsSearch } from '../_utils/httpClient.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(__filename);
const TOOLS_DIR = join(ROOT);

function listJsFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...listJsFiles(p));
    else if (e.isFile() && e.name.endsWith('.js')) files.push(p);
  }
  return files;
}

const all = listJsFiles(TOOLS_DIR)
  .filter(p => !p.endsWith('run-all.js'))
  .sort();

// Start one HTTP server for all tests, simple /mcp proxy
console.log(colorize('🚀 Starting MCP SAP Docs test suite...', 'cyan'));
const server = startServerHttp();
let failures = 0;
let totalTests = 0;
try {
  console.log(colorize('⏳ Waiting for server to be ready...', 'yellow'));
  await waitForStatus();
  console.log(colorize('✅ Server ready!\n', 'green'));
  
  for (const file of all) {
    const fileName = file.split('/').pop();
    console.log(colorize(`\n📁 Running ${fileName}`, 'blue'));
    console.log(colorize('─'.repeat(50), 'dim'));
    
    // Each test file default-exports an array of cases
    const mod = await import(fileURLToPath(new URL(file, import.meta.url)));
    const cases = (mod.default || []).flat();
    
    for (const c of cases) {
      totalTests++;
      try {
        const text = await docsSearch(c.query);
        const checks = Array.isArray(c.expectIncludes) ? c.expectIncludes : [c.expectIncludes];
        const ok = checks.every(f => text.includes(f));
        if (!ok) throw new Error(`expected fragment(s) not found: ${checks.join(', ')}`);
        console.log(`  ${colorize('✅', 'green')} ${colorize(c.name, 'white')}`);
      } catch (err) {
        failures++;
        console.log(`  ${colorize('❌', 'red')} ${colorize(c.name, 'white')}: ${colorize(err?.message || err, 'red')}`);
      }
    }
  }
} finally {
  await stopServer(server);
}

console.log(colorize('\n' + '═'.repeat(60), 'dim'));
if (failures) {
  console.log(`${colorize('❌ Test Results:', 'red')} ${colorize(`${failures}/${totalTests} tests failed`, 'red')}`);
  process.exit(1);
} else {
  console.log(`${colorize('🎉 Test Results:', 'green')} ${colorize(`All ${totalTests} tests passed!`, 'green')}`);
}


