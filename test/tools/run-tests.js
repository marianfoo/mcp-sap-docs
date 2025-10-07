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
  console.log('  npm run test                                          Run all test files');
  console.log('  npm run test -- --spec <file-path>                   Run specific test file');
  console.log('');
  console.log(colorize('Examples:', 'yellow'));
  console.log('  npm run test');
  console.log('  npm run test:fast                                    Skip build step');
  console.log('  npm run test -- --spec search-cap-docs.js');
  console.log('  npm run test:smoke                                   Quick smoke test');
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
    try {
      if (typeof c.validate === 'function') {
        // New path: custom validator gets helpers, uses existing server
        const res = await c.validate({ docsSearch });

        if (res && typeof res === 'object' && res.skipped) {
          const reason = res.message ? ` - ${res.message}` : '';
          console.log(`  ${colorize('⚠️', 'yellow')} ${colorize(c.name, 'white')} (skipped${reason})`);
          continue;
        }
        
        fileTests++; // Only count tests that are actually executed
        const passed = typeof res === 'object' ? !!res.passed : !!res;
        if (!passed) {
          const msg = (res && res.message) ? ` - ${res.message}` : '';
          throw new Error(`custom validator failed${msg}`);
        }
        console.log(`  ${colorize('✅', 'green')} ${colorize(c.name, 'white')}`);
      } else {
        // Legacy path: expectIncludes (kept for existing tests)
        const text = await docsSearch(c.query);

        if (c.skipIfNoResults && /No results found for/.test(text)) {
          console.log(`  ${colorize('⚠️', 'yellow')} ${colorize(c.name, 'white')} (skipped - no results available)`);
          continue;
        }
        
        fileTests++; // Only count tests that are actually executed

        // Check expectIncludes
        if (c.expectIncludes) {
          const checks = Array.isArray(c.expectIncludes) ? c.expectIncludes : [c.expectIncludes];
          const ok = checks.every(expectedFragment => {
            // Direct match (exact inclusion)
            if (text.includes(expectedFragment)) {
              return true;
            }
            
            // If expected fragment is a parent document (no #), check if any section from that document is found
            if (!expectedFragment.includes('#')) {
              // Look for any section that starts with the expected parent document path followed by #
              const sectionPattern = new RegExp(expectedFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '#[^\\s]*', 'g');
              return sectionPattern.test(text);
            }
            
            return false;
          });
          if (!ok) throw new Error(`expected fragment(s) not found: ${checks.join(', ')}`);
        }
        
        // Check expectContains (for URL verification)
        if (c.expectContains) {
          const containsChecks = Array.isArray(c.expectContains) ? c.expectContains : [c.expectContains];
          const containsOk = containsChecks.every(expectedContent => {
            return text.includes(expectedContent);
          });
          if (!containsOk) throw new Error(`expected content not found: ${containsChecks.join(', ')}`);
        }
        
        // Check expectUrlPattern (for URL format verification)
        if (c.expectUrlPattern) {
          // Extract URLs from the response using the 🔗 emoji
          const urlRegex = /🔗\s+(https?:\/\/[^\s\n]+)/g;
          const urls = [];
          let match;
          while ((match = urlRegex.exec(text)) !== null) {
            urls.push(match[1]);
          }
          
          if (urls.length === 0) {
            throw new Error('no URLs found in response (expected URL pattern)');
          }
          
          const urlPattern = c.expectUrlPattern;
          const matchingUrl = urls.some(url => {
            if (typeof urlPattern === 'string') {
              return url.includes(urlPattern) || new RegExp(urlPattern).test(url);
            }
            return urlPattern.test(url);
          });
          
          if (!matchingUrl) {
            throw new Error(`no URL matching pattern "${urlPattern}" found. URLs found: ${urls.join(', ')}`);
          }
        }
        
        // Check expectPattern (for general regex pattern matching)
        if (c.expectPattern) {
          const pattern = c.expectPattern;
          if (!pattern.test(text)) {
            throw new Error(`text does not match expected pattern: ${pattern}`);
          }
        }
        
        console.log(`  ${colorize('✅', 'green')} ${colorize(c.name, 'white')}`);
      }
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
      .filter(p => {
        const fileName = p.split('/').pop();
        // Skip runner scripts and utility files
        return !fileName.startsWith('run-') && 
               !fileName.includes('test-with-reranker') &&
               fileName.endsWith('.js');
      })
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
