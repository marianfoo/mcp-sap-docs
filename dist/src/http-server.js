import { createServer } from "http";
import { readFileSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { execSync } from "child_process";
import { searchLibraries } from "./lib/localDocs.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Read package.json for version info
let packageInfo = { version: "unknown", name: "mcp-sap-docs" };
try {
    const packagePath = join(__dirname, "../../package.json");
    packageInfo = JSON.parse(readFileSync(packagePath, "utf8"));
}
catch (error) {
    console.warn("Could not read package.json:", error instanceof Error ? error.message : "Unknown error");
}
// Build timestamp (when the server was compiled)
const buildTimestamp = new Date().toISOString();
async function handleMCPRequest(content) {
    // Use the enhanced search functionality for any query
    try {
        const searchResult = await searchLibraries(content);
        if (searchResult.results.length > 0) {
            return {
                role: "assistant",
                content: searchResult.results[0].description
            };
        }
        else {
            return {
                role: "assistant",
                content: searchResult.error || `No results found for "${content}". Try searching for UI5 controls like 'button', 'table', 'wizard', or concepts like 'routing', 'annotation', 'authentication', 'cds entity', 'wdi5 testing'.`
            };
        }
    }
    catch (error) {
        console.error("Search error:", error);
        return {
            role: "assistant",
            content: `Sorry, there was an error searching for "${content}". Please try again with a different query.`
        };
    }
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
            }
            else {
                // Detached HEAD
                gitInfo = {
                    commit: gitHead.substring(0, 7),
                    fullCommit: gitHead,
                    detached: true
                };
            }
        }
        catch (error) {
            gitInfo = { error: "Git info not available" };
        }
        // Check documentation status and get resource information
        let docsStatus = "unknown";
        let resourceInfo = {
            totalResources: 0,
            sources: {},
            lastUpdated: "unknown"
        };
        try {
            const testSearch = await searchLibraries("test");
            docsStatus = testSearch.results.length > 0 ? "available" : "no_results";
            // Get resource information (file counts, last modified times)
            const sourcesPath = join(__dirname, "../../sources");
            // Check each documentation source
            const sources = ["sapui5-docs", "cap-docs", "openui5", "wdi5"];
            for (const source of sources) {
                const sourcePath = join(sourcesPath, source);
                try {
                    const stats = readFileSync(join(sourcePath, ".git/HEAD"), "utf8").trim();
                    const refFile = join(sourcePath, ".git", stats.startsWith("ref: ") ? stats.substring(5) : "");
                    const lastCommit = readFileSync(refFile, "utf8").trim().substring(0, 7);
                    // Try to get commit date
                    let lastModified = "unknown";
                    try {
                        const gitLog = execSync(`cd "${sourcePath}" && git log -1 --format="%ci"`, { encoding: "utf8" });
                        lastModified = new Date(gitLog.trim()).toISOString();
                    }
                    catch (e) {
                        // If git log fails, use file modification time as fallback
                        try {
                            const headStats = statSync(refFile);
                            lastModified = headStats.mtime.toISOString();
                        }
                        catch (statError) {
                            // File doesn't exist, keep as "unknown"
                        }
                    }
                    resourceInfo.sources[source] = {
                        status: "available",
                        lastCommit,
                        lastModified,
                        path: sourcePath
                    };
                    resourceInfo.totalResources++;
                }
                catch (error) {
                    resourceInfo.sources[source] = {
                        status: "missing",
                        error: error instanceof Error ? error.message : "Unknown error"
                    };
                }
            }
            // Get overall last updated time (most recent source update)
            const lastUpdates = Object.values(resourceInfo.sources)
                .filter((s) => s.lastModified && s.lastModified !== "unknown")
                .map((s) => new Date(s.lastModified))
                .sort((a, b) => b.getTime() - a.getTime());
            if (lastUpdates.length > 0) {
                resourceInfo.lastUpdated = lastUpdates[0].toISOString();
            }
        }
        catch (error) {
            docsStatus = "error";
            resourceInfo = { error: error instanceof Error ? error.message : "Unknown error" };
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
                resources: resourceInfo
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
                const mcpRequest = JSON.parse(body);
                const response = await handleMCPRequest(mcpRequest.content);
                res.setHeader("Content-Type", "application/json");
                res.writeHead(200);
                res.end(JSON.stringify(response));
            }
            catch (error) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
        });
    }
    else {
        res.writeHead(404);
        res.end("Not Found");
    }
});
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`📚 HTTP test server running on http://localhost:${PORT}/mcp`);
});
