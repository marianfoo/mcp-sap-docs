import { createServer } from "http";
import { searchLibraries, fetchLibraryDocumentation } from "./lib/localDocs.js";

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