import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

const project = process.cwd();
let child: ChildProcessWithoutNullStreams | undefined;
let closed: Promise<unknown> | undefined;
let fixture: string | undefined;

afterEach(async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
  await closed;
  child = undefined;
  closed = undefined;
  if (fixture) rmSync(fixture, { recursive: true, force: true });
  fixture = undefined;
});

describe("stdio transport", () => {
  it.each(["sap-docs", "abap"])("reserves stdout for MCP messages in the %s variant", async (variant) => {
    fixture = mkdtempSync(path.join(tmpdir(), "mcp-stdio-"));
    const html = readFileSync(path.join(project, "test/fixtures/abap-feature-matrix-sample.html"), "utf8");
    const preload = path.join(fixture, "offline.mjs");
    // Exercise real startup, API-cache and tool-handler diagnostics without network access.
    writeFileSync(preload, `
      globalThis.fetch = async (url) => {
        if (!String(url).startsWith("https://software-heroes.com/")) {
          throw new Error("Unexpected network request in stdio test: " + url);
        }
        console.info("stdio fixture: API response");
        console.debug("stdio fixture: API debug");
        return Response.json({ status: true, content: ${JSON.stringify(html)} });
      };
    `);

    child = spawn(process.execPath, ["--import", preload, "dist/src/server.js"], {
      cwd: project,
      env: {
        ...process.env,
        MCP_VARIANT: variant,
        MCP_PRELOAD_EMBEDDINGS: "false",
        SOFTWARE_HEROES_AFM_CACHE_PATH: path.join(fixture, "matrix.json"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    closed = once(child, "close");
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", data => { stdout += data; });
    child.stderr.setEncoding("utf8").on("data", data => { stderr += data; });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();

    const request = async (id: number, method: string, params: object = {}) => {
      child!.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      const line = await lines.next();
      expect(line.done, `Server exited before response ${id}: ${stderr}`).toBe(false);
      // Parse the raw line strictly: diagnostics and blank log lines must fail here.
      const response = JSON.parse(line.value!);
      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(id);
      expect(response.error).toBeUndefined();
      return response.result;
    };

    const initialized = await request(1, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "stdio-regression-test", version: "1.0.0" },
    });
    expect(initialized.capabilities.tools).toBeDefined();
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

    const listed = await request(2, "tools/list");
    expect(listed.tools.some((tool: { name: string }) => tool.name === "abap_feature_matrix")).toBe(true);

    const result = await request(3, "tools/call", {
      name: "abap_feature_matrix",
      arguments: { query: "CDS", limit: 3 },
    });
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(result.content[0].text).matches.length).toBeGreaterThan(0);

    child.kill("SIGINT");
    await closed;
    expect(stdout.endsWith("\n")).toBe(true);
    const messages = stdout.replace(/\r?\n$/, "").split(/\r?\n/).map(line => JSON.parse(line));
    expect(messages.map(message => message.id)).toEqual([1, 2, 3]);
    expect(stderr).toContain("[FeatureMatrix] Prefetching matrix at startup");
    expect(stderr).toContain("[SoftwareHeroes] Cached response");
    expect(stderr).toContain("[ABAP_FEATURE_MATRIX]");
    expect(stderr).toContain("stdio fixture: API response");
    expect(stderr).toContain("stdio fixture: API debug");
  });
});
