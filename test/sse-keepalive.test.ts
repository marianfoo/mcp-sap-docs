import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { startSseKeepAlive } from "../src/lib/sseKeepAlive.js";

// Regression guard for marianfoo/abap-mcp-server#3: an idle MCP SSE stream used to sit
// silent until the client's undici `bodyTimeout` (300 s) tore it down, which kicked off the
// 409 reconnect storm. A short interval is used so the test runs in milliseconds rather than
// minutes.
const INTERVAL = 20;

let server: http.Server | undefined;

async function listen(app: express.Express): Promise<string> {
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server!.once("listening", resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

afterEach(() => {
  server?.close();
  server = undefined;
});

describe("startSseKeepAlive", () => {
  it("heartbeats an idle text/event-stream response without ending it", async () => {
    const app = express();
    app.get("/sse", (_req, res) => {
      startSseKeepAlive(res, INTERVAL);
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      res.flushHeaders();
      // Deliberately never writes anything else — this is the idle standalone MCP stream.
    });

    const base = await listen(app);
    const res = await fetch(`${base}/sse`, { headers: { accept: "text/event-stream" } });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    let received = "";
    while (!received.includes(": keepalive\n\n")) {
      const { value, done } = await reader.read();
      expect(done, "stream ended instead of heartbeating").toBe(false);
      received += decoder.decode(value!);
    }
    expect(received.startsWith(": keepalive\n\n")).toBe(true);
    await reader.cancel();
  });

  it("leaves a non-SSE response untouched", async () => {
    const app = express();
    app.get("/json", (_req, res) => {
      startSseKeepAlive(res, INTERVAL);
      // Slower than the heartbeat: if the guard were missing, a comment line would be
      // written into the JSON body and the parse below would fail.
      setTimeout(() => res.json({ ok: true }), INTERVAL * 4);
    });

    const base = await listen(app);
    const res = await fetch(`${base}/json`);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("clears the interval once the response is closed", async () => {
    const app = express();
    let timer: NodeJS.Timeout | undefined;
    app.get("/sse", (_req, res) => {
      timer = startSseKeepAlive(res, INTERVAL);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.flushHeaders();
    });

    const base = await listen(app);
    const controller = new AbortController();
    const res = await fetch(`${base}/sse`, {
      headers: { accept: "text/event-stream" },
      signal: controller.signal
    });
    void res.body!.getReader().read().catch(() => {});
    controller.abort();
    await new Promise(resolve => setTimeout(resolve, INTERVAL * 4));

    // `_destroyed` is Node-internal, but it is the only observable difference between a
    // cleared timer and a live one — `hasRef()` is already false because we unref(). Without
    // this assertion the test would pass even if the interval leaked, and one leaked 30 s
    // interval per dropped session adds up on the public server.
    expect((timer as unknown as { _destroyed: boolean })._destroyed).toBe(true);
  });
});
