import { createServer } from "http";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { searchLibraries, fetchLibraryDocumentation } from "./lib/localDocs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version info
let packageInfo = { version: "unknown", name: "mcp-sap-docs" };
try {
  const packagePath = join(__dirname, "../../package.json");
  packageInfo = JSON.parse(readFileSync(packagePath, "utf8"));
} catch (error) {
  console.warn("Could not read package.json:", error instanceof Error ? error.message : "Unknown error");
}

// Build timestamp (when the server was compiled)
const buildTimestamp = new Date().toISOString();

interface MCPRequest {
  role: string;
  content: string;
}

async function handleMCPRequest(content: string) {
  // Simple pattern matching for demo purposes
  if (content.toLowerCase().includes("cap") && content.toLowerCase().includes("event")) {
    const docs = await fetchLibraryDocumentation("/cap", "event");
    return {
      role: "assistant",
      content: docs || "No CAP event documentation found."
    };
  }
  
  if (content.toLowerCase().includes("sapui5") || content.toLowerCase().includes("ui5")) {
    const searchResult = await searchLibraries("sapui5");
    const docs = await fetchLibraryDocumentation("/sapui5");
    return {
      role: "assistant", 
      content: `Found SAPUI5 documentation with ${searchResult.results[0]?.totalSnippets || 0} code snippets.\n\nFirst section:\n${docs?.substring(0, 500)}...`
    };
  }

  if (content.toLowerCase().includes("cap")) {
    const searchResult = await searchLibraries("cap");
    const docs = await fetchLibraryDocumentation("/cap");
    return {
      role: "assistant",
      content: `Found CAP documentation with ${searchResult.results[0]?.totalSnippets || 0} code snippets.\n\nFirst section:\n${docs?.substring(0, 500)}...`
    };
  }

  return {
    role: "assistant",
    content: "I can help with SAP UI5 and CAP documentation. Try asking about specific topics like 'CAP event handlers' or 'SAPUI5 dialogs'."
  };
}

const server = createServer(async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Enhanced status endpoint with version and deployment info
  if (req.method === "GET" && req.url === "/status") {
    res.setHeader("Content-Type", "application/json");
    res.writeHead(200);
    
    // Try to read git info if available
    let gitInfo = {};
    try {
      const gitHeadPath = join(__dirname, "../../.git/HEAD");
      const gitHead = readFileSync(gitHeadPath, "utf8").trim();
      
      if (gitHead.startsWith("ref: ")) {
        // We're on a branch
        const branchRef = gitHead.substring(5);
        const commitPath = join(__dirname, "../../.git", branchRef);
        const commitHash = readFileSync(commitPath, "utf8").trim();
        gitInfo = {
          branch: branchRef.split("/").pop(),
          commit: commitHash.substring(0, 7),
          fullCommit: commitHash
        };
      } else {
        // Detached HEAD
        gitInfo = {
          commit: gitHead.substring(0, 7),
          fullCommit: gitHead,
          detached: true
        };
      }
    } catch (error) {
      gitInfo = { error: "Git info not available" };
    }

    // Check if we can access documentation (basic health check)
    let docsStatus = "unknown";
    try {
      const testSearch = await searchLibraries("test");
      docsStatus = testSearch.results.length > 0 ? "available" : "no_results";
    } catch (error) {
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
        communityAvailable: true
      },
      deployment: {
        method: process.env.DEPLOYMENT_METHOD || "unknown",
        timestamp: process.env.DEPLOYMENT_TIMESTAMP || "unknown",
        triggeredBy: process.env.GITHUB_ACTOR || "unknown"
      },
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform
    };

    res.end(JSON.stringify(statusResponse, null, 2));
    return;
  }

  if (req.method === "POST" && req.url === "/mcp") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const mcpRequest: MCPRequest = JSON.parse(body);
        const response = await handleMCPRequest(mcpRequest.content);
        
        res.setHeader("Content-Type", "application/json");
        res.writeHead(200);
        res.end(JSON.stringify(response));
      } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`📚 HTTP test server running on http://localhost:${PORT}/mcp`);
}); 