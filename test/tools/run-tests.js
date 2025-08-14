// Unified test runner for MCP SAP Docs - supports both all tests and specific files
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

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    specificFile: null,
    showHelp: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--spec' && i + 1 < args.length) {
      config.specificFile = args[i + 1];
      i++; // Skip next argument since it's the file path
    } else if (arg === '--help' || arg === '-h') {
      config.showHelp = true;
    }
  }
  
  return config;
}

function showHelp() {
  console.log(colorize('MCP SAP Docs Test Runner', 'cyan'));
  console.log('');
  console.log(colorize('Usage:', 'yellow'));
  console.log('  npm run test:tools                                    Run all test files');
  console.log('  npm run test:tools -- --spec <file-path>             Run specific test file');
  console.log('');
  console.log(colorize('Examples:', 'yellow'));
  console.log('  npm run test:tools');
  console.log('  npm run test:tools -- --spec test/tools/sap_docs_search/search-cap-docs.js');
  console.log('  npm run test:tools -- --spec sap_docs_search/search-cap-docs.js');
  console.log('  npm run test:tools -- --spec search-cap-docs.js');
  console.log('');
  console.log(colorize('Available test files:', 'yellow'));
  
  const allFiles = listJsFiles(TOOLS_DIR)
    .filter(p => !p.endsWith('run-all.js') && !p.endsWith('run-single.js') && !p.endsWith('run-tests.js'));
  
  allFiles.forEach(f => {
    // Show relative path from project root
    const relativePath = f.replace(process.cwd() + '/', '');
    console.log(colorize(`  ${relativePath}`, 'cyan'));
  });
}

function findTestFile(pattern) {
  const allFiles = listJsFiles(TOOLS_DIR)
    .filter(p => !p.endsWith('run-all.js') && !p.endsWith('run-single.js') && !p.endsWith('run-tests.js'));
  
  // Try different matching strategies
  let matches = [];
  
  // 1. Exact path match (relative to project root or absolute)
  if (pattern.startsWith('/')) {
    matches = allFiles.filter(f => f === pattern);
  } else {
    // Try as relative path from project root
    const fullPattern = join(process.cwd(), pattern);
    matches = allFiles.filter(f => f === fullPattern);
  }
  
  // 2. If no exact match, try partial path matching
  if (matches.length === 0) {
    matches = allFiles.filter(f => f.includes(pattern));
  }
  
  // 3. If still no match, try just filename matching
  if (matches.length === 0) {
    matches = allFiles.filter(f => f.split('/').pop() === pattern);
  }
  
  if (matches.length === 0) {
    console.log(colorize(`❌ No test file found matching: ${pattern}`, 'red'));
    console.log(colorize('Available test files:', 'yellow'));
    allFiles.forEach(f => {
      const relativePath = f.replace(process.cwd() + '/', '');
      console.log(colorize(`  ${relativePath}`, 'cyan'));
    });
    process.exit(1);
  }
  
  if (matches.length > 1) {
    console.log(colorize(`⚠️  Multiple files match "${pattern}":`, 'yellow'));
    matches.forEach(f => {
      const relativePath = f.replace(process.cwd() + '/', '');
      console.log(colorize(`  ${relativePath}`, 'cyan'));
    });
    console.log(colorize('Please be more specific.', 'yellow'));
    process.exit(1);
  }
  
  return matches[0];
}

async function runTestFile(filePath, fileName) {
  console.log(colorize(`📁 Running ${fileName}`, 'blue'));
  console.log(colorize('─'.repeat(50), 'dim'));
  
  // Load and run the test file
  const mod = await import(fileURLToPath(new URL(filePath, import.meta.url)));
  const cases = (mod.default || []).flat();
  
  if (cases.length === 0) {
    console.log(colorize('⚠️  No test cases found in file', 'yellow'));
    return { tests: 0, failures: 0 };
  }
  
  let fileFailures = 0;
  let fileTests = 0;
  
  for (const c of cases) {
    fileTests++;
    try {
      const text = await docsSearch(c.query);
      const checks = Array.isArray(c.expectIncludes) ? c.expectIncludes : [c.expectIncludes];
      const ok = checks.every(f => text.includes(f));
      if (!ok) throw new Error(`expected fragment(s) not found: ${checks.join(', ')}`);
      console.log(`  ${colorize('✅', 'green')} ${colorize(c.name, 'white')}`);
    } catch (err) {
      fileFailures++;
      console.log(`  ${colorize('❌', 'red')} ${colorize(c.name, 'white')}: ${colorize(err?.message || err, 'red')}`);
    }
  }
  
  return { tests: fileTests, failures: fileFailures };
}

async function runTests() {
  const config = parseArgs();
  
  if (config.showHelp) {
    showHelp();
    process.exit(0);
  }
  
  let testFiles = [];
  
  if (config.specificFile) {
    // Run specific test file
    const testFile = findTestFile(config.specificFile);
    const fileName = testFile.split('/').pop();
    console.log(colorize(`🚀 Running specific test: ${fileName}`, 'cyan'));
    testFiles = [testFile];
  } else {
    // Run all test files
    console.log(colorize('🚀 Starting MCP SAP Docs test suite...', 'cyan'));
    testFiles = listJsFiles(TOOLS_DIR)
      .filter(p => !p.endsWith('run-all.js') && !p.endsWith('run-single.js') && !p.endsWith('run-tests.js'))
      .sort();
  }
  
  // Start HTTP server
  const server = startServerHttp();
  let totalFailures = 0;
  let totalTests = 0;
  
  try {
    console.log(colorize('⏳ Waiting for server to be ready...', 'yellow'));
    await waitForStatus();
    console.log(colorize('✅ Server ready!\n', 'green'));
    
    for (const file of testFiles) {
      const fileName = file.split('/').pop();
      
      // Add spacing between files when running multiple
      if (testFiles.length > 1) {
        console.log('');
      }
      
      const result = await runTestFile(file, fileName);
      totalTests += result.tests;
      totalFailures += result.failures;
    }
  } finally {
    await stopServer(server);
  }
  
  console.log(colorize('\n' + '═'.repeat(60), 'dim'));
  if (totalFailures) {
    console.log(`${colorize('❌ Test Results:', 'red')} ${colorize(`${totalFailures}/${totalTests} tests failed`, 'red')}`);
    process.exit(1);
  } else {
    console.log(`${colorize('🎉 Test Results:', 'green')} ${colorize(`All ${totalTests} tests passed!`, 'green')}`);
  }
}

runTests().catch(err => {
  console.error(colorize('Fatal error:', 'red'), err);
  process.exit(1);
});
