#!/usr/bin/env node

/**
 * Manual production smoke tests for both public Streamable MCP servers.
 *
 * Default checks:
 * - GET /health
 * - GET /status (required on both servers)
 * - MCP initialize / tools/list
 * - sample search + fetch roundtrip (including parameterized search options)
 *
 * Optional checks (--online):
 * - sample online search (includeOnline=true)
 * - abap_feature_matrix
 */

const args = process.argv.slice(2);

function hasFlag(name) {
  return args.includes(name);
}

function getArg(name, fallback) {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const includeOnline = hasFlag("--online");
const serverFilter = getArg("--server", "all");
const timeoutMs = Number(getArg("--timeout-ms", process.env.PROD_TEST_TIMEOUT_MS || "25000"));

const sapBase = getArg("--sap-url", process.env.SAP_DOCS_URL || "https://mcp-sap-docs.marianzeis.de");
const abapBase = getArg("--abap-url", process.env.ABAP_MCP_URL || "https://mcp-abap.marianzeis.de");

const MCP_ACCEPT = "application/json, text/event-stream";
const INIT_PROTOCOL = "2025-07-09";

const servers = [
  {
    key: "sap-docs",
    label: "SAP Docs",
    base: sapBase,
    requiredTools: ["search", "fetch", "abap_feature_matrix"],
    requiredAbsentTools: ["abap_lint"],
    sourceSmoke: "abap-docs-standard",
  },
  {
    key: "abap",
    label: "ABAP MCP",
    base: abapBase,
    requiredTools: ["search", "fetch", "abap_feature_matrix", "abap_lint"],
    requiredAbsentTools: [],
    sourceSmoke: "abap-docs-standard",
  },
].filter((server) => serverFilter === "all" || serverFilter === server.key);

if (servers.length === 0) {
  console.error("No server selected. Use --server sap-docs|abap|all");
  process.exit(2);
}

let failures = 0;
let warnings = 0;

function ok(msg) {
  console.log(`✅ ${msg}`);
}

function info(msg) {
  console.log(`ℹ️  ${msg}`);
}

function warn(msg) {
  warnings += 1;
  console.log(`⚠️  ${msg}`);
}

function fail(msg) {
  failures += 1;
  console.error(`❌ ${msg}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function preview(text, max = 220) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function parseJson(text, context) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${context} returned non-JSON body: ${preview(text)}`);
  }
}

function parseJsonRpcFromSse(sseText, context) {
  const lines = sseText.split(/\r?\n/);
  const payloads = [];
  let dataLines = [];

  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
      continue;
    }

    if (line.trim() === "") {
      if (dataLines.length > 0) {
        payloads.push(dataLines.join("\n"));
        dataLines = [];
      }
    }
  }

  if (dataLines.length > 0) {
    payloads.push(dataLines.join("\n"));
  }

  for (const payload of payloads) {
    const candidate = payload.trim();
    if (!candidate) continue;

    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && ("result" in parsed || "error" in parsed)) {
        return parsed;
      }
    } catch {
      // continue
    }
  }

  throw new Error(`${context} returned SSE without parseable JSON-RPC payload: ${preview(sseText)}`);
}

function parseJsonRpcResponse(res, bodyText, context) {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/event-stream")) {
    return parseJsonRpcFromSse(bodyText, context);
  }
  return parseJson(bodyText, context);
}

function parseToolResponse(result, context) {
  if (result?.structuredContent) {
    return result.structuredContent;
  }

  const textContent = result?.content?.find?.(
    (item) => item?.type === "text" && typeof item.text === "string"
  );

  if (textContent?.text) {
    return parseJson(textContent.text, context);
  }

  return null;
}

async function requestText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs ?? timeoutMs),
  });
  const bodyText = await response.text();
  return { response, bodyText };
}

/**
 * Wraps an async check so that generic errors (e.g. timeout) carry the step name.
 */
async function withStepContext(stepName, fn) {
  try {
    return await fn();
  } catch (error) {
    const msg = error?.message || String(error);
    throw new Error(`[${stepName}] ${msg}`, { cause: error });
  }
}

async function checkHealth(baseUrl) {
  const { response, bodyText } = await requestText(`${baseUrl}/health`, { method: "GET" });
  assert(response.status === 200, `/health expected 200, got ${response.status}: ${preview(bodyText)}`);

  const body = parseJson(bodyText, "/health");
  assert(body?.status === "healthy", `/health status is not healthy: ${bodyText}`);
  ok("/health is healthy");
}

async function checkStatus(baseUrl) {
  const { response, bodyText } = await requestText(`${baseUrl}/status`, {
    method: "GET",
  });

  if (response.status !== 200) {
    throw new Error(`/status expected 200, got ${response.status}: ${preview(bodyText)}`);
  }

  const body = parseJson(bodyText, "/status");
  if (body?.status !== "healthy") {
    throw new Error(`/status returned non-healthy payload: ${preview(bodyText)}`);
  }

  ok("/status is healthy");
}

async function mcpInitialize(baseUrl) {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: INIT_PROTOCOL,
      capabilities: {},
      clientInfo: {
        name: "prod-smoke",
        version: "1.0.0",
      },
    },
  };

  const { response, bodyText } = await requestText(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: MCP_ACCEPT,
    },
    body: JSON.stringify(payload),
    timeoutMs: 30000,
  });

  if (!response.ok) {
    throw new Error(`initialize failed with HTTP ${response.status}: ${preview(bodyText)}`);
  }

  const rpc = parseJsonRpcResponse(response, bodyText, "initialize");
  const sessionId = response.headers.get("mcp-session-id");

  assert(sessionId, "initialize did not return mcp-session-id header");
  assert(!rpc?.error, `initialize returned JSON-RPC error: ${JSON.stringify(rpc?.error)}`);
  assert(rpc?.result, `initialize did not return result: ${preview(bodyText)}`);

  return { sessionId, result: rpc.result };
}

async function mcpRequest(baseUrl, sessionId, id, method, params = {}) {
  const payload = {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };

  const { response, bodyText } = await requestText(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: MCP_ACCEPT,
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify(payload),
    timeoutMs: 45000,
  });

  if (!response.ok) {
    throw new Error(`${method} failed with HTTP ${response.status}: ${preview(bodyText)}`);
  }

  const rpc = parseJsonRpcResponse(response, bodyText, method);

  if (rpc?.error) {
    throw new Error(`${method} returned JSON-RPC error: ${JSON.stringify(rpc.error)}`);
  }

  return rpc?.result;
}

async function closeSession(baseUrl, sessionId) {
  if (!sessionId) return;

  try {
    await fetch(`${baseUrl}/mcp`, {
      method: "DELETE",
      headers: {
        accept: MCP_ACCEPT,
        "mcp-session-id": sessionId,
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // non-critical
  }
}

function getSearchResults(toolCallResult, context) {
  const parsed = parseToolResponse(toolCallResult, context);
  const results = parsed?.results;

  assert(Array.isArray(results), `${context} did not return structured results array`);
  return results;
}

async function runServerChecks(server) {
  const { key, label, base, requiredTools, requiredAbsentTools, sourceSmoke } = server;
  const baseUrl = base.replace(/\/$/, "");

  console.log(`\n=== ${label} (${baseUrl}) ===`);

  await withStepContext("health", () => checkHealth(baseUrl));
  await withStepContext("status", () => checkStatus(baseUrl));

  let sessionId;
  try {
    const init = await withStepContext("initialize", () => mcpInitialize(baseUrl));
    sessionId = init.sessionId;
    ok("MCP initialize succeeded and session id returned");

    let requestId = 2;

    const toolsResult = await withStepContext("tools/list", () =>
      mcpRequest(baseUrl, sessionId, requestId++, "tools/list", {})
    );
    const toolNames = (toolsResult?.tools || []).map((tool) => tool.name).sort();

    for (const required of requiredTools) {
      assert(
        toolNames.includes(required),
        `required tool missing: ${required}; available tools: ${toolNames.join(", ")}`
      );
    }

    for (const absent of requiredAbsentTools) {
      assert(!toolNames.includes(absent), `${absent} should not be exposed on ${key}`);
    }

    ok(`tools/list contract valid (${toolNames.join(", ")})`);

    const offlineSearch = await withStepContext("search (offline)", () =>
      mcpRequest(baseUrl, sessionId, requestId++, "tools/call", {
        name: "search",
        arguments: {
          query: "RAP behavior definition",
          k: 5,
          includeOnline: false,
        },
      })
    );

    const offlineResults = getSearchResults(offlineSearch, "search (offline)");
    assert(offlineResults.length > 0, "offline search returned zero results");
    ok(`offline sample search returned ${offlineResults.length} result(s)`);

    const parameterizedSearch = await withStepContext("search (parameterized)", () =>
      mcpRequest(baseUrl, sessionId, requestId++, "tools/call", {
        name: "search",
        arguments: {
          query: "CDS annotations",
          k: 8,
          includeOnline: false,
          includeSamples: false,
          abapFlavor: "auto",
          sources: [sourceSmoke],
        },
      })
    );

    const parameterizedResults = getSearchResults(parameterizedSearch, "search (parameterized)");
    assert(parameterizedResults.length > 0, "parameterized search returned zero results");
    ok(`parameterized sample search returned ${parameterizedResults.length} result(s)`);

    const first = offlineResults[0];
    assert(first?.id, "search result missing id");

    const fetchResult = await withStepContext("fetch", () =>
      mcpRequest(baseUrl, sessionId, requestId++, "tools/call", {
        name: "fetch",
        arguments: {
          id: first.id,
        },
      })
    );

    const document = parseToolResponse(fetchResult, "fetch");
    assert(document?.id, "fetch result missing id");
    assert(typeof document?.text === "string" && document.text.length > 50, "fetch returned empty/short text");
    ok(`fetch succeeded for id=${document.id}`);

    if (includeOnline) {
      info("Running optional online checks (--online)");

      const onlineSearch = await withStepContext("search (online)", () =>
        mcpRequest(baseUrl, sessionId, requestId++, "tools/call", {
          name: "search",
          arguments: {
            query: "RAP determination",
            k: 8,
            includeOnline: true,
          },
        })
      );

      const onlineResults = getSearchResults(onlineSearch, "search (online)");
      assert(onlineResults.length > 0, "online search returned zero results");
      ok(`online sample search returned ${onlineResults.length} result(s)`);

      const matrixResult = await withStepContext("abap_feature_matrix", () =>
        mcpRequest(baseUrl, sessionId, requestId++, "tools/call", {
          name: "abap_feature_matrix",
          arguments: {
            query: "inline declaration",
            limit: 3,
          },
        })
      );

      const matrix = parseToolResponse(matrixResult, "abap_feature_matrix");
      const matches = matrix?.matches || [];
      assert(Array.isArray(matches), "abap_feature_matrix matches is not an array");
      assert(matches.length > 0, "abap_feature_matrix returned no matches");
      ok(`abap_feature_matrix returned ${matches.length} match(es)`);
    }

    console.log(`--- ${key} smoke OK ---`);
  } finally {
    await closeSession(baseUrl, sessionId);
  }
}

(async () => {
  console.log("Production MCP smoke tests");
  console.log(`Mode: ${includeOnline ? "quick + online" : "quick"}`);
  console.log(`Timeout: ${timeoutMs}ms`);

  for (const server of servers) {
    try {
      await runServerChecks(server);
    } catch (error) {
      const detail = error.cause ? ` (cause: ${error.cause.message})` : "";
      fail(`${server.label}: ${error.message}${detail}`);
    }
  }

  if (warnings > 0) {
    console.log(`\nWarnings: ${warnings}`);
  }

  if (failures > 0) {
    console.error(`\n${failures} server check(s) failed.`);
    process.exit(1);
  }

  console.log("\nAll selected server checks passed.");
})();
