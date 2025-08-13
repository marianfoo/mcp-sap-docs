// Simple HTTP client for testing MCP tools via /mcp endpoint
import { spawn } from 'node:child_process';

// ANSI color codes for logging
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

const TEST_PORT = process.env.TEST_MCP_PORT || '43122';
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function sleep(ms) { 
  return new Promise(r => setTimeout(r, ms)); 
}

export function startServerHttp() {
  return spawn('node', ['dist/src/http-server.js'], {
    env: { ...process.env, PORT: TEST_PORT },
    stdio: 'ignore'
  });
}

export async function waitForStatus(maxAttempts = 50, delayMs = 200) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await fetch(`${BASE_URL}/status`);
      if (res.ok) return await res.json();
    } catch (_) {}
    await sleep(delayMs);
  }
  throw new Error(colorize('status endpoint did not become ready in time', 'red'));
}

export async function stopServer(child) {
  try { child?.kill?.('SIGINT'); } catch (_) {}
  await sleep(150);
}

export async function docsSearch(query) {
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'user', content: String(query) })
  });
  if (!res.ok) throw new Error(colorize(`http /mcp failed: ${res.status}`, 'red'));
  const payload = await res.json();
  return payload?.content || '';
}


