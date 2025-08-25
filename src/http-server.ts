import { createServer } from "http";
import { readFileSync, statSync, existsSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { execSync } from "child_process";
import { searchLibraries } from "./lib/localDocs.js";
import { search } from "./lib/search.js";
import { CONFIG } from "./lib/config.js";
import { loadMetadata, getDocUrlConfig } from "./lib/metadata.js";
import { generateDocumentationUrl, formatSearchResult } from "./lib/url-generation/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---- build/package meta -----------------------------------------------------
let packageInfo: { version: string; name: string } = { version: "unknown", name: "mcp-sap-docs" };
try {
  const packagePath = join(__dirname, "../../package.json");
  packageInfo = JSON.parse(readFileSync(packagePath, "utf8"));
} catch (error) {
  console.warn("Could not read package.json:", error instanceof Error ? error.message : "Unknown error");
}
const buildTimestamp = new Date().toISOString();

// ---- helpers ----------------------------------------------------------------
function safeExec(cmd: string, cwd?: string) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], cwd }).trim();
  } catch {
    return "";
  }
}

// Handle both normal repos and submodules where `.git` is a FILE with `gitdir: …`
function resolveGitDir(repoPath: string): string | null {
  const dotGit = join(repoPath, ".git");
  if (!existsSync(dotGit)) return null;
  const st = statSync(dotGit);
  if (st.isDirectory()) return dotGit;

  // .git is a file that points to the real gitdir
  const content = readFileSync(dotGit, "utf8");
  const m = content.match(/^gitdir:\s*(.+)$/m);
  if (!m) return null;
  return resolve(repoPath, m[1]);
}

function readGitMeta(repoPath: string) {
  try {
    const gitDir = resolveGitDir(repoPath);
    if (!gitDir) return { error: "No git dir" };

    const headPath = join(gitDir, "HEAD");
    const head = readFileSync(headPath, "utf8").trim();
    if (head.startsWith("ref: ")) {
      const ref = head.slice(5).trim();
      const refPath = join(gitDir, ref);
      const commit = readFileSync(refPath, "utf8").trim();
      const date = safeExec(`git log -1 --format="%ci"`, repoPath);
      return {
        branch: ref.split("/").pop(),
        commit: commit.substring(0, 7),
        fullCommit: commit,
        lastModified: date ? new Date(date).toISOString() : statSync(refPath).mtime.toISOString(),
      };
    } else {
      // detached
      const date = safeExec(`git log -1 --format="%ci"`, repoPath);
      return {
        commit: head.substring(0, 7),
        fullCommit: head,
        detached: true,
        lastModified: date ? new Date(date).toISOString() : statSync(headPath).mtime.toISOString(),
      };
    }
  } catch (e: any) {
    return { error: e?.message || "git meta error" };
  }
}

// Format results to be MCP-tool compatible, keep legacy formatting
async function handleMCPRequest(content: string) {
  try {
    // Use simple BM25 search with centralized config
    const results = await search(content, { 
      k: CONFIG.RETURN_K 
    });
    
    if (results.length === 0) {
      return {
        role: "assistant",
        content: `No results found for "${content}". Try searching for UI5 controls like 'button', 'table', 'wizard', testing topics like 'wdi5', 'testing', 'e2e', or concepts like 'routing', 'annotation', 'authentication'.`
      };
    }
    
    // Format results with URL generation
    const formattedResults = results.map((r, index) => {
      return formatSearchResult(r, CONFIG.EXCERPT_LENGTH_MAIN, {
        generateDocumentationUrl,
        getDocUrlConfig
      });
    }).join('\n');
    
    const summary = `Found ${results.length} results for '${content}':\n\n${formattedResults}`;
    
    return { role: "assistant", content: summary };
  } catch (error) {
    console.error('Hybrid search failed, falling back to original search:', error);
    // Fallback to original search
    try {
      const searchResult = await searchLibraries(content);
      if (searchResult.results.length > 0) {
        return { role: "assistant", content: searchResult.results[0].description };
      }
      return {
        role: "assistant", 
        content: searchResult.error || `No results for "${content}". Try 'button', 'table', 'wizard', 'routing', 'annotation', 'authentication', 'cds entity', 'wdi5 testing'.`,
      };
    } catch (fallbackError) {
      console.error("Search error:", error);
      return { role: "assistant", content: `Error searching for "${content}". Try a different query.` };
    }
  }
}

function json(res: any, code: number, payload: unknown) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload, null, 2));
}

// ---- server -----------------------------------------------------------------
const server = createServer(async (req, res) => {
  // CORS (you can tighten later if needed)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });

  // healthz/readyz: cheap checks for PM2/K8s or manual curl
  if (req.method === "GET" && (req.url === "/healthz" || req.url === "/readyz")) {
    return json(res, 200, { status: "ok", ts: new Date().toISOString() });
  }

  // status: richer info
  if (req.method === "GET" && req.url === "/status") {
    // top-level repo git info
    let gitInfo: any = {};
    try {
      const repoPath = resolve(__dirname, "../..");
      gitInfo = readGitMeta(repoPath);
      // normalize to include branch if unknown
      if (!gitInfo.branch) {
        const branch = safeExec("git rev-parse --abbrev-ref HEAD", repoPath);
        if (branch && branch !== "HEAD") gitInfo.branch = branch;
      }
    } catch {
      gitInfo = { error: "Git info not available" };
    }

    // docs/search status
    const sourcesRoot = join(__dirname, "../../sources");
    const knownSources = [
      "sapui5-docs",
      "cap-docs",
      "openui5",
      "wdi5",
      "ui5-tooling",
      "cloud-mta-build-tool",
      "ui5-webcomponents",
      "cloud-sdk",
      "cloud-sdk-ai"
    ];
    const presentSources = existsSync(sourcesRoot)
      ? readdirSync(sourcesRoot, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
      : [];

    const toCheck = knownSources.filter((s) => presentSources.includes(s));
    const resources: Record<string, any> = {};
    let totalResources = 0;

    for (const name of knownSources) {
      const p = join(sourcesRoot, name);
      if (!existsSync(p)) {
        resources[name] = { status: "missing", error: "not found" };
        continue;
      }
      const meta = readGitMeta(p);
      if ((meta as any).error) {
        // still count as available content; just git meta missing (e.g., copied tree)
        resources[name] = { status: "available", note: (meta as any).error, path: p };
        totalResources++;
      } else {
        resources[name] = { status: "available", path: p, ...meta };
        totalResources++;
      }
    }

    // index + FTS footprint
    const dataRoot = join(__dirname, "../../data");
    const indexJson = join(dataRoot, "index.json");
    const ftsDb = join(dataRoot, "docs.sqlite");
    const indexStat = existsSync(indexJson) ? statSync(indexJson) : null;
    const ftsStat = existsSync(ftsDb) ? statSync(ftsDb) : null;

    // quick search smoke test
    let docsStatus = "unknown";
    try {
      const testSearch = await searchLibraries("button");
      docsStatus = testSearch.results.length > 0 ? "available" : "no_results";
    } catch {
      docsStatus = "error";
    }

    const statusResponse = {
      status: "healthy",
      service: packageInfo.name,
      version: packageInfo.version,
      timestamp: new Date().toISOString(),
      buildTimestamp,
      git: gitInfo,
      documentation: {
        status: docsStatus,
        searchAvailable: true,
        communityAvailable: true,
        resources: {
          totalResources,
          sources: resources,
          lastUpdated:
            Object.values(resources)
              .map((s: any) => s.lastModified)
              .filter(Boolean)
              .sort()
              .pop() || "unknown",
          artifacts: {
            indexJson: indexStat
              ? { path: indexJson, sizeBytes: indexStat.size, mtime: indexStat.mtime.toISOString() }
              : "missing",
            ftsSqlite: ftsStat
              ? { path: ftsDb, sizeBytes: ftsStat.size, mtime: ftsStat.mtime.toISOString() }
              : "missing",
          },
        },
      },
      deployment: {
        method: process.env.DEPLOYMENT_METHOD || "unknown",
        timestamp: process.env.DEPLOYMENT_TIMESTAMP || "unknown",
        triggeredBy: process.env.GITHUB_ACTOR || "unknown",
      },
      runtime: {
        uptimeSeconds: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
        port: Number(process.env.PORT || 3001),
        bind: "127.0.0.1",
      },
    };

    return json(res, 200, statusResponse);
  }

  if (req.method === "POST" && req.url === "/mcp") {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", async () => {
      try {
        const mcpRequest: { role: string; content: string } = JSON.parse(body);
        const response = await handleMCPRequest(mcpRequest.content);
        return json(res, 200, response);
      } catch {
        return json(res, 400, { error: "Invalid JSON" });
      }
    });
    return;
  }

  // default 404 JSON (keeps curl|jq friendly)
  return json(res, 404, { error: "Not Found", path: req.url, method: req.method });
});

// Initialize search system with metadata
(async () => {
  console.log('🔧 Initializing BM25 search system...');
  try {
    loadMetadata();
    console.log('✅ Search system ready with metadata');
  } catch (error) {
    console.warn('⚠️ Metadata loading failed, using defaults');
    console.log('✅ Search system ready');
  }
  
  // Start server
  const PORT = Number(process.env.PORT || 3001);
  // Bind to 127.0.0.1 to keep local-only
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`📚 HTTP server running on http://127.0.0.1:${PORT} (status: /status, health: /healthz, ready: /readyz)`);
  });
})();