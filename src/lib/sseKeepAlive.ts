import type { ServerResponse } from "node:http";

/**
 * Heartbeat interval for SSE responses. Has to stay under the shortest idle limit any hop
 * imposes: undici's 300 s `bodyTimeout` in Node-based MCP clients, and nginx's 60 s
 * `proxy_read_timeout` in front of the public deployment.
 */
const SSE_KEEPALIVE_MS = 30_000;

/**
 * Writes a periodic SSE comment to `res` for as long as it is an open `text/event-stream`
 * response, and stops when the response closes.
 *
 * Why this is needed: the MCP standalone GET stream carries zero bytes while the client is
 * idle — the SDK only writes to it for server-initiated notifications, which this server
 * never sends. Node-based MCP clients read that stream with `fetch`, and undici's default
 * 300 s `bodyTimeout` aborts a body that goes that long without a chunk, surfacing as
 * `TypeError: terminated` (cause `BodyTimeoutError`). The client then reconnects, and
 * concurrent reconnect GETs collide with the SDK's "only one standalone SSE stream per
 * session" rule and get HTTP 409 — which burns the client's 2-attempt retry budget and
 * permanently disables the server for that session. See marianfoo/abap-mcp-server#3.
 *
 * `:` lines are SSE comments; every SSE parser ignores them (the MCP client SDK explicitly
 * skips data-less events). The content-type check matters: the same handler also serves
 * plain `application/json` responses, and a stray comment line would corrupt those.
 */
export function startSseKeepAlive(res: ServerResponse, intervalMs = SSE_KEEPALIVE_MS): NodeJS.Timeout {
  const timer = setInterval(() => {
    if (
      res.headersSent &&
      res.writable &&
      !res.writableEnded &&
      String(res.getHeader("content-type") ?? "").includes("text/event-stream")
    ) {
      res.write(": keepalive\n\n");
    }
  }, intervalMs);

  timer.unref();
  res.on("close", () => clearInterval(timer));
  return timer;
}
