import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const project = process.cwd();
let child: ChildProcess | undefined;
let fixture: string | undefined;

afterEach(async () => {
  if (child && child.exitCode === null) {
    const stopped = new Promise(resolve => child!.once("exit", resolve));
    child.kill("SIGKILL");
    await stopped;
  }
  child = undefined;
  if (fixture) rmSync(fixture, { recursive: true, force: true });
  fixture = undefined;
});

async function startServer(variant: string, content: "abap" | "unrelated" | "empty" | "missing" | "invalid") {
  fixture = mkdtempSync(path.join(tmpdir(), "mcp-http-status-"));
  // Copy only the compiled runtime: no index.json or source corpus is available.
  cpSync(path.join(project, "dist/src"), path.join(fixture, "dist/src"), { recursive: true });
  cpSync(path.join(project, "config"), path.join(fixture, "config"), { recursive: true });
  cpSync(path.join(project, "package.json"), path.join(fixture, "package.json"));
  symlinkSync(path.join(project, "node_modules"), path.join(fixture, "node_modules"));
  mkdirSync(path.join(fixture, "dist/data"), { recursive: true });
  if (content !== "missing") {
    const db = new Database(path.join(fixture, "dist/data/docs.sqlite"));
    if (content !== "invalid") {
      db.exec("CREATE VIRTUAL TABLE docs USING fts5(title)");
      if (content === "unrelated") db.prepare("INSERT INTO docs(title) VALUES (?)").run("Fiori UI5");
      if (content === "abap") db.prepare("INSERT INTO docs(title) VALUES (?)").run("ABAP CDS entity");
    }
    db.close();
  }
  // Background cache prefetches are irrelevant to this local readiness check.
  const preload = path.join(fixture, "offline.mjs");
  writeFileSync(preload, 'globalThis.fetch = async () => { throw new Error("Network disabled in status test"); };');
  const portServer = createServer();
  await new Promise<void>(resolve => portServer.listen(0, "127.0.0.1", resolve));
  const port = (portServer.address() as { port: number }).port;
  await new Promise<void>(resolve => portServer.close(() => resolve()));
  child = spawn(process.execPath, ["--import", preload, path.join(fixture, "dist/src/http-server.js")], {
    cwd: fixture,
    env: { ...process.env, PORT: String(port), MCP_VARIANT: variant, MCP_PRELOAD_EMBEDDINGS: "false" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await new Promise<void>((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`HTTP server did not start: ${output}`)), 5000);
    child!.on("exit", code => { clearTimeout(timeout); reject(new Error(`HTTP server exited ${code}: ${output}`)); });
    child!.stderr!.on("data", data => { output += data; });
    child!.stdout!.on("data", data => {
      output += data;
      if (output.includes("HTTP server running")) { clearTimeout(timeout); resolve(); }
    });
  });
  return `http://127.0.0.1:${port}`;
}

for (const variant of ["sap-docs", "abap"]) {
  describe(`${variant} HTTP status`, () => {
    it("checks the FTS index without loading or scanning the source corpus", async () => {
      const base = await startServer(variant, "abap");
      const response = await fetch(`${base}/status`, { signal: AbortSignal.timeout(2000) });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.status).toBe("healthy");
      expect(body.documentation.status).toBe("available");
      expect(body.documentation.searchAvailable).toBe(true);
      expect((await fetch(`${base}/healthz`)).status).toBe(200);
    });

    for (const content of ["unrelated", "empty", "missing", "invalid"] as const) {
      it(`reports an unavailable search index (${content})`, async () => {
        const base = await startServer(variant, content);
        const response = await fetch(`${base}/status`, { signal: AbortSignal.timeout(2000) });
        const body = await response.json();
        expect(response.status).toBe(503);
        expect(body.status).toBe("unhealthy");
        expect(body.documentation.status).toBe(["empty", "unrelated"].includes(content) ? "no_results" : "error");
        expect(body.documentation.searchAvailable).toBe(false);
        // Readiness failure does not turn the process liveness check into a search.
        expect((await fetch(`${base}/healthz`)).status).toBe(200);
      });
    }
  });
}
