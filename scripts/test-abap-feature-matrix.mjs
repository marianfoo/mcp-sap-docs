#!/usr/bin/env node

/**
 * Test abap_feature_matrix tool on SAP Docs and ABAP MCP production servers.
 */

const servers = [
  { name: "SAP Docs", url: "https://mcp-sap-docs.marianzeis.de" },
  { name: "ABAP MCP", url: "https://mcp-abap.marianzeis.de" },
];

const MCP_ACCEPT = "application/json, text/event-stream";

async function mcpInitialize(baseUrl) {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: MCP_ACCEPT },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-07-09",
        capabilities: {},
        clientInfo: { name: "abap-matrix-test", version: "1.0.0" },
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const sessionId = res.headers.get("mcp-session-id");
  if (!sessionId) throw new Error("No session ID");
  return sessionId;
}

function parseSseToJson(bodyText) {
  const lines = bodyText.split(/\r?\n/);
  let dataLines = [];
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    } else if (line.trim() === "" && dataLines.length > 0) {
      const payload = dataLines.join("\n").trim();
      if (payload) {
        try {
          const parsed = JSON.parse(payload);
          if (parsed && ("result" in parsed || "error" in parsed)) return parsed;
        } catch {}
      }
      dataLines = [];
    }
  }
  if (dataLines.length > 0) {
    try {
      return JSON.parse(dataLines.join("\n").trim());
    } catch {}
  }
  return JSON.parse(bodyText);
}

async function mcpCall(baseUrl, sessionId, method, params) {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: MCP_ACCEPT,
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method, params }),
    signal: AbortSignal.timeout(30000),
  });
  const bodyText = await res.text();
  const body = bodyText.includes("event:") ? parseSseToJson(bodyText) : JSON.parse(bodyText);
  if (body?.error) throw new Error(body.error?.message || JSON.stringify(body.error));
  return body?.result;
}

function parseToolResponse(result) {
  if (result?.structuredContent) return result.structuredContent;
  const tc = result?.content?.find?.((c) => c?.type === "text" && typeof c.text === "string");
  return tc?.text ? JSON.parse(tc.text) : null;
}

async function testServer(server) {
  console.log(`\n=== ${server.name} (${server.url}) ===\n`);
  const sessionId = await mcpInitialize(server.url);

  const result = await mcpCall(server.url, sessionId, "tools/call", {
    name: "abap_feature_matrix",
    arguments: { query: "inline declaration", limit: 5 },
  });

  const data = parseToolResponse(result);
  if (!data) {
    console.log("❌ No parseable response");
    return false;
  }

  const matches = data?.matches || [];
  console.log(`Status: ${data?.error ? "ERROR" : "OK"}`);
  if (data?.error) console.log(`Error: ${data.error}`);
  console.log(`Matches: ${matches.length}`);
  if (matches.length > 0) {
    console.log("\nSample matches:");
    matches.slice(0, 3).forEach((m, i) => {
      console.log(`  ${i + 1}. ${m?.feature || m?.name || "?"} (section: ${m?.sectionName || "?"})`);
      if (m?.statusByRelease) console.log(`     Releases: ${JSON.stringify(m.statusByRelease)}`);
    });
  }
  return matches.length > 0;
}

(async () => {
  console.log("abap_feature_matrix production check");
  for (const server of servers) {
    try {
      await testServer(server);
    } catch (err) {
      console.log(`\n❌ ${server.name}: ${err.message}`);
    }
  }
  console.log("\nDone.");
})();
