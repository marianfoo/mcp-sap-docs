// Minimal smoke test for Streamable HTTP server
// - Starts server on a test port
// - Verifies /health
// - Verifies GET /mcp returns 400 error JSON

import { spawn } from 'node:child_process';

const TEST_PORT = process.env.TEST_MCP_PORT || '43122';
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

/** Retry helper */
async function waitForHealth(maxAttempts = 30, delayMs = 200) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return res.json();
    } catch (_) {}
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error('health endpoint did not become ready in time');
}

function startServer() {
  const child = spawn('node', ['dist/src/streamable-http-server.js'], {
    env: { ...process.env, MCP_PORT: TEST_PORT },
    stdio: 'ignore'
  });
  return child;
}

async function main() {
  const server = startServer();
  let exitCode = 0;
  try {
    const health = await waitForHealth();

    // Basic assertions
    if (health.status !== 'healthy') throw new Error('status not healthy');
    if (health.service !== 'mcp-sap-docs-streamable') throw new Error('unexpected service');
    if (health.transport !== 'streamable-http') throw new Error('unexpected transport');

    // GET /mcp should be a 400 without init/session
    const bad = await fetch(`${BASE_URL}/mcp`);
    if (bad.status !== 400) throw new Error(`expected 400 on GET /mcp, got ${bad.status}`);
    const badJson = await bad.json();
    if (!badJson?.error?.code || badJson.error.code !== -32000) {
      throw new Error('unexpected error payload from /mcp');
    }

    console.log('OK streamable: health and basic /mcp check passed');
  } catch (err) {
    exitCode = 1;
    console.error('FAIL streamable test:', err?.message || err);
  } finally {
    try { server.kill('SIGINT'); } catch (_) {}
    // slight delay to allow clean shutdown
    await new Promise(r => setTimeout(r, 150));
    process.exit(exitCode);
  }
}

main();


