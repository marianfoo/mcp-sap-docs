#!/usr/bin/env node

/**
 * Tests for the sap_community_search MCP tool.
 *
 * Runs against a local streamable HTTP server (started automatically).
 * Verifies:
 *   1. tools/list exposes sap_community_search
 *   2. Invoking sap_community_search returns structured results
 *   3. Community post IDs from results are fetchable via the fetch tool
 */

import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const TEST_PORT = process.env.TEST_MCP_PORT || "43199";
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const MCP_ACCEPT = "application/json, text/event-stream";
const INIT_PROTOCOL = "2025-07-09";
const TIMEOUT_MS = 45_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  return spawn("node", ["dist/src/streamable-http-server.js"], {
    env: { ...process.env, MCP_PORT: TEST_PORT, MCP_HOST: "127.0.0.1" },
    stdio: "ignore",
  });
}

async function waitForHealth(maxAttempts = 60, delayMs = 500) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {}
    await sleep(delayMs);
  }
  throw new Error("Server did not become healthy in time");
}

function parseJsonRpc(res, bodyText, context) {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/event-stream")) {
    for (const chunk of bodyText.split(/\r?\n\r?\n/)) {
      const dataLine = chunk
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!dataLine) continue;
      try {
        const parsed = JSON.parse(dataLine);
        if ("result" in parsed || "error" in parsed) return parsed;
      } catch {}
    }
    throw new Error(`${context}: no JSON-RPC in SSE body`);
  }
  return JSON.parse(bodyText);
}

async function mcpPost(body, timeoutMs = TIMEOUT_MS) {
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: MCP_ACCEPT },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  return { res, text };
}

async function mcpInit() {
  const { res, text } = await mcpPost({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: INIT_PROTOCOL,
      capabilities: {},
      clientInfo: { name: "community-tool-test", version: "1.0.0" },
    },
  });
  const rpc = parseJsonRpc(res, text, "initialize");
  const sid = res.headers.get("mcp-session-id");
  assert.ok(sid, "initialize must return mcp-session-id");
  assert.ok(rpc.result, "initialize must return result");
  return sid;
}

async function mcpCall(sessionId, id, method, params = {}) {
  const { res, text } = await mcpPost(
    { jsonrpc: "2.0", id, method, params },
    TIMEOUT_MS
  );
  // Attach session header for subsequent calls
  const rpc = parseJsonRpc(res, text, method);
  if (rpc.error) throw new Error(`${method} error: ${JSON.stringify(rpc.error)}`);
  return rpc.result;
}

async function mcpCallWithSession(sessionId, id, method, params = {}) {
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: MCP_ACCEPT,
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  const rpc = parseJsonRpc(res, text, method);
  if (rpc.error) throw new Error(`${method} error: ${JSON.stringify(rpc.error)}`);
  return rpc.result;
}

function extractResults(toolResult) {
  if (toolResult?.structuredContent?.results) return toolResult.structuredContent.results;
  const textItem = toolResult?.content?.find((c) => c.type === "text");
  if (textItem?.text) {
    const parsed = JSON.parse(textItem.text);
    return parsed.results || [];
  }
  return [];
}

// ----- Tests -----

async function testToolsListContainsCommunitySearch(sessionId) {
  console.log("  [1] tools/list contains sap_community_search ...");
  const result = await mcpCallWithSession(sessionId, 10, "tools/list");
  const names = (result.tools || []).map((t) => t.name);
  assert.ok(names.includes("sap_community_search"), `sap_community_search missing from tools: ${names.join(", ")}`);

  const tool = result.tools.find((t) => t.name === "sap_community_search");
  assert.ok(tool.inputSchema?.properties?.query, "inputSchema must have query property");
  assert.ok(tool.description.length > 100, "description should be detailed");
  console.log("     PASS");
}

async function testCommunitySearchReturnsStructuredResponse(sessionId) {
  console.log("  [2] sap_community_search returns structured response ...");
  const result = await mcpCallWithSession(sessionId, 20, "tools/call", {
    name: "sap_community_search",
    arguments: { query: "RAP Augmentation" },
  });

  // Tool must return content array (either results or graceful error)
  assert.ok(result?.content, "response must have content array");
  const textItem = result.content.find((c) => c.type === "text");
  assert.ok(textItem?.text, "response must include text content");

  const body = JSON.parse(textItem.text);

  const results = extractResults(result);
  if (results.length > 0) {
    const first = results[0];
    assert.ok(first.id, "result must have id");
    assert.ok(first.title, "result must have title");
    assert.ok(first.url, "result must have url");
    assert.ok(first.url.includes("community.sap.com"), `URL should be SAP Community: ${first.url}`);
    console.log(`     PASS (${results.length} results, first: "${first.title.slice(0, 60)}...")`);
    return first;
  } else {
    // SAP Community may be blocked by WAF/bot protection in some environments
    assert.ok(body.error, "empty results must include error message");
    console.log(`     PASS (graceful empty: ${body.error.slice(0, 80)}...)`);
    return null;
  }
}

async function testCommunityResultFetchable(sessionId, communityResult) {
  console.log("  [3] fetch works for community post ID ...");
  const result = await mcpCallWithSession(sessionId, 30, "tools/call", {
    name: "fetch",
    arguments: { id: communityResult.id },
  });

  // Parse the fetch response
  let document;
  if (result?.structuredContent) {
    document = result.structuredContent;
  } else {
    const textItem = result?.content?.find((c) => c.type === "text");
    if (textItem?.text) {
      document = JSON.parse(textItem.text);
    }
  }

  assert.ok(document, "fetch must return document");
  assert.ok(document.text || document.id, "fetch document must have text or id");

  const textLen = (document.text || "").length;
  console.log(`     PASS (fetched ${textLen} chars for ${communityResult.id})`);
}

async function testCommunitySearchMissingQuery(sessionId) {
  console.log("  [4] sap_community_search rejects missing query ...");
  const result = await mcpCallWithSession(sessionId, 40, "tools/call", {
    name: "sap_community_search",
    arguments: {},
  });

  // Should return an error response, not throw
  const textItem = result?.content?.find((c) => c.type === "text");
  assert.ok(textItem, "error response must include text content");
  const body = JSON.parse(textItem.text);
  assert.ok(body.error, "response must contain error field");
  assert.ok(body.error.toLowerCase().includes("missing") || body.error.toLowerCase().includes("query"),
    `error message should mention missing query: ${body.error}`);
  console.log("     PASS");
}

// ----- Main -----

(async () => {
  console.log("sap_community_search tool tests");
  console.log(`Server: ${BASE_URL}\n`);

  const child = startServer();
  try {
    console.log("Starting server ...");
    await waitForHealth();
    console.log("Server healthy\n");

    const sessionId = await mcpInit();
    console.log(`Session: ${sessionId}\n`);

    await testToolsListContainsCommunitySearch(sessionId);
    const communityResult = await testCommunitySearchReturnsStructuredResponse(sessionId);
    if (communityResult) {
      await testCommunityResultFetchable(sessionId, communityResult);
    } else {
      console.log("  [3] fetch for community post ... SKIPPED (no results from community)");
    }
    await testCommunitySearchMissingQuery(sessionId);

    console.log("\n✅ All sap_community_search tests passed");
  } catch (err) {
    console.error(`\n❌ FAIL: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    try { child.kill("SIGINT"); } catch {}
    await sleep(300);
  }
})();
