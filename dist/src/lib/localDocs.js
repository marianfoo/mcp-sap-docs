// src/lib/localDocs.ts
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
// Get the directory of this script and find the project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// From dist/src/lib/localDocs.js, go up 3 levels to project root
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
// SAP Community API configuration
const SAP_COMMUNITY_API_BASE = "https://community.sap.com/api/2.0/search";
const SAP_PRODUCTS = {
    SAPUI5: "500983881501772639608291559920477",
    CAP: "ed5c1ef6-932f-4c19-b2ba-1be375109ff5"
};
// Search SAP Community for relevant posts
async function searchSAPCommunity(query) {
    try {
        // Build LiQL query for SAP Community API
        const liqlQuery = `
      select body, id, subject, search_snippet, post_time 
      from messages 
      where (subject MATCHES '${query}' or body MATCHES '${query}') 
      and kudos.sum(weight) > 5 
      and conversation.style = 'blog' 
      and depth = 0 
      and (
        products.id = '${SAP_PRODUCTS.SAPUI5}' or 
        products.id = '${SAP_PRODUCTS.CAP}'
      )
      ORDER BY post_time DESC 
      LIMIT 10
    `.replace(/\s+/g, ' ').trim();
        const url = `${SAP_COMMUNITY_API_BASE}?q=${encodeURIComponent(liqlQuery)}`;
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'SAP-Docs-MCP/1.0'
            }
        });
        if (!response.ok) {
            console.warn(`SAP Community API returned ${response.status}: ${response.statusText}`);
            return [];
        }
        const data = await response.json();
        if (data.status !== 'success' || !data.data?.items) {
            return [];
        }
        return data.data.items.map(post => ({
            id: `community-${post.id}`,
            title: post.subject,
            description: post.search_snippet.replace(/<[^>]*>/g, ''), // Strip HTML tags
            totalSnippets: 1,
            source: 'community',
            url: `https://community.sap.com/t5/technology-blogs-by-sap/bg-p/t/${post.id}`,
            postTime: post.post_time
        }));
    }
    catch (error) {
        console.warn('Failed to search SAP Community:', error);
        return [];
    }
}
// Get full content of a community post
async function getCommunityPost(postId) {
    try {
        // Extract numeric ID from community post ID
        const numericId = postId.replace('community-', '');
        const liqlQuery = `
      select body, subject, post_time 
      from messages 
      where id = '${numericId}'
    `.replace(/\s+/g, ' ').trim();
        const url = `${SAP_COMMUNITY_API_BASE}?q=${encodeURIComponent(liqlQuery)}`;
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'SAP-Docs-MCP/1.0'
            }
        });
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        if (data.status !== 'success' || !data.data?.items?.[0]) {
            return null;
        }
        const post = data.data.items[0];
        const postDate = new Date(post.post_time).toLocaleDateString();
        return `# ${post.subject}

**Source**: SAP Community Blog Post  
**Published**: ${postDate}  
**URL**: https://community.sap.com/t5/technology-blogs-by-sap/bg-p/t/${post.id}

---

${post.body || post.search_snippet}

---

*This content is from the SAP Community and represents community knowledge and experiences.*`;
    }
    catch (error) {
        console.warn('Failed to get community post:', error);
        return null;
    }
}
// Format JavaScript content for better readability in documentation context
function formatJSDocContent(content, controlName) {
    const lines = content.split('\n');
    const result = [];
    result.push(`# ${controlName} - OpenUI5 Control API`);
    result.push('');
    // Extract main JSDoc comment
    const mainJSDocMatch = content.match(/\/\*\*\s*([\s\S]*?)\*\//);
    if (mainJSDocMatch) {
        const cleanDoc = mainJSDocMatch[1]
            .split('\n')
            .map(line => line.replace(/^\s*\*\s?/, ''))
            .join('\n')
            .trim();
        result.push('## Description');
        result.push('');
        result.push(cleanDoc);
        result.push('');
    }
    // Extract metadata section
    const metadataMatch = content.match(/metadata\s*:\s*\{([\s\S]*?)\n\s*\}/);
    if (metadataMatch) {
        result.push('## Control Metadata');
        result.push('');
        result.push('```javascript');
        result.push('metadata: {');
        result.push(metadataMatch[1]);
        result.push('}');
        result.push('```');
        result.push('');
    }
    // Extract properties
    const propertiesMatch = content.match(/properties\s*:\s*\{([\s\S]*?)\n\s*\}/);
    if (propertiesMatch) {
        result.push('## Properties');
        result.push('');
        result.push('```javascript');
        result.push(propertiesMatch[1]);
        result.push('```');
        result.push('');
    }
    // Extract events
    const eventsMatch = content.match(/events\s*:\s*\{([\s\S]*?)\n\s*\}/);
    if (eventsMatch) {
        result.push('## Events');
        result.push('');
        result.push('```javascript');
        result.push(eventsMatch[1]);
        result.push('```');
        result.push('');
    }
    // Extract aggregations
    const aggregationsMatch = content.match(/aggregations\s*:\s*\{([\s\S]*?)\n\s*\}/);
    if (aggregationsMatch) {
        result.push('## Aggregations');
        result.push('');
        result.push('```javascript');
        result.push(aggregationsMatch[1]);
        result.push('```');
        result.push('');
    }
    // Extract associations
    const associationsMatch = content.match(/associations\s*:\s*\{([\s\S]*?)\n\s*\}/);
    if (associationsMatch) {
        result.push('## Associations');
        result.push('');
        result.push('```javascript');
        result.push(associationsMatch[1]);
        result.push('```');
        result.push('');
    }
    result.push('---');
    result.push('');
    result.push('### Full Source Code');
    result.push('');
    result.push('```javascript');
    result.push(content);
    result.push('```');
    return result.join('\n');
}
// Format sample content for better readability in documentation context
function formatSampleContent(content, filePath, title) {
    const fileExt = path.extname(filePath);
    const controlName = title.split(' ')[0]; // Extract control name from title
    const fileName = path.basename(filePath);
    const result = [];
    result.push(`# ${title}`);
    result.push('');
    // Add file information
    result.push(`## File Information`);
    result.push(`- **File**: \`${fileName}\``);
    result.push(`- **Type**: ${fileExt.slice(1).toUpperCase()} ${getFileTypeDescription(fileExt)}`);
    result.push(`- **Control**: ${controlName}`);
    result.push('');
    // Add description based on file type
    if (fileExt === '.js') {
        if (content.toLowerCase().includes('controller')) {
            result.push(`## Controller Implementation`);
            result.push(`This file contains the controller logic for the ${controlName} sample.`);
        }
        else if (content.toLowerCase().includes('component')) {
            result.push(`## Component Definition`);
            result.push(`This file defines the application component for the ${controlName} sample.`);
        }
        else {
            result.push(`## JavaScript Implementation`);
            result.push(`This file contains JavaScript code for the ${controlName} sample.`);
        }
    }
    else if (fileExt === '.xml') {
        result.push(`## XML View`);
        result.push(`This file contains the XML view definition for the ${controlName} sample.`);
    }
    else if (fileExt === '.json') {
        result.push(`## JSON Configuration`);
        if (fileName.includes('manifest')) {
            result.push(`This file contains the application manifest configuration.`);
        }
        else {
            result.push(`This file contains JSON configuration or sample data.`);
        }
    }
    else if (fileExt === '.html') {
        result.push(`## HTML Page`);
        result.push(`This file contains the HTML page setup for the ${controlName} sample.`);
    }
    result.push('');
    // Add the actual content with syntax highlighting
    result.push(`## Source Code`);
    result.push('');
    result.push(`\`\`\`${getSyntaxHighlighting(fileExt)}`);
    result.push(content);
    result.push('```');
    // Add usage tips
    result.push('');
    result.push('## Usage Tips');
    result.push('');
    if (fileExt === '.js' && content.includes('onPress')) {
        result.push('- This sample includes event handlers (onPress methods)');
    }
    if (fileExt === '.xml' && content.includes('{')) {
        result.push('- This view uses data binding patterns');
    }
    if (content.toLowerCase().includes('model')) {
        result.push('- This sample demonstrates model usage');
    }
    if (content.toLowerCase().includes('router') || content.toLowerCase().includes('routing')) {
        result.push('- This sample includes routing configuration');
    }
    return result.join('\n');
}
function getFileTypeDescription(ext) {
    switch (ext) {
        case '.js': return 'JavaScript';
        case '.xml': return 'XML View';
        case '.json': return 'JSON Configuration';
        case '.html': return 'HTML Page';
        default: return 'File';
    }
}
function getSyntaxHighlighting(ext) {
    switch (ext) {
        case '.js': return 'javascript';
        case '.xml': return 'xml';
        case '.json': return 'json';
        case '.html': return 'html';
        default: return 'text';
    }
}
let INDEX = null;
async function loadIndex() {
    if (!INDEX) {
        const raw = await fs.readFile(path.join(DATA_DIR, "index.json"), "utf8");
        INDEX = JSON.parse(raw);
    }
    return INDEX;
}
export async function searchLibraries(query) {
    const index = await loadIndex();
    const q = query.toLowerCase();
    // Search across all documents in all libraries
    const allMatches = [];
    for (const lib of Object.values(index)) {
        // Check if library name/description matches
        const libNameMatch = lib.name.toLowerCase().includes(q);
        const libDescMatch = lib.description.toLowerCase().includes(q);
        if (libNameMatch || libDescMatch) {
            allMatches.push({
                score: libNameMatch ? 100 : 80,
                libraryId: lib.id,
                libraryName: lib.name,
                docId: lib.id,
                docTitle: `${lib.name} (Full Library)`,
                docDescription: lib.description,
                matchType: libNameMatch ? 'Library Name' : 'Library Description',
                snippetCount: lib.docs.reduce((s, d) => s + d.snippetCount, 0),
                source: 'docs'
            });
        }
        // Search within individual documents
        for (const doc of lib.docs) {
            let score = 0;
            let matchType = '';
            // Check title match (highest priority)
            if (doc.title.toLowerCase().includes(q)) {
                score = 90;
                matchType = 'Document Title';
            }
            // Check description match
            else if (doc.description.toLowerCase().includes(q)) {
                score = 70;
                matchType = 'Document Description';
            }
            // For UI5 controls, also check if it's a control name pattern
            else if (lib.id === '/openui5-api' && isControlMatch(doc.title, q)) {
                score = 85;
                matchType = 'UI5 Control';
            }
            // Partial matches in title get lower score
            else if (doc.title.toLowerCase().split(/[.\s_-]/).some(part => part.includes(q))) {
                score = 60;
                matchType = 'Partial Title Match';
            }
            if (score > 0) {
                allMatches.push({
                    score,
                    libraryId: lib.id,
                    libraryName: lib.name,
                    docId: doc.id,
                    docTitle: doc.title,
                    docDescription: doc.description,
                    matchType,
                    snippetCount: doc.snippetCount,
                    source: 'docs'
                });
            }
        }
    }
    // Sort by score (highest first), then by title
    allMatches.sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        return a.docTitle.localeCompare(b.docTitle);
    });
    // Take top results
    const topResults = allMatches.slice(0, 10);
    if (!topResults.length) {
        return { results: [], error: `No documentation found for "${query}". Try searching for terms like "button", "table", "annotation", "wizard", "routing", or specific control names.` };
    }
    // Group results by type for better presentation
    const libraries = new Set();
    const controls = topResults.filter(r => r.matchType === 'UI5 Control');
    const docs = topResults.filter(r => r.matchType !== 'UI5 Control' && r.matchType !== 'Library Name');
    const libs = topResults.filter(r => r.matchType === 'Library Name');
    let response = `Found ${topResults.length} results for "${query}":\n\n`;
    // Show libraries first if any
    if (libs.length > 0) {
        response += `📚 **Libraries:**\n`;
        for (const lib of libs) {
            response += `⭐️ **${lib.docTitle}** - \`${lib.libraryId}\`\n`;
            response += `   ${lib.docDescription}\n`;
            response += `   Total docs: ${Math.floor(lib.snippetCount / 10)}, Use in sap_docs_get\n\n`;
            libraries.add(lib.libraryId);
        }
    }
    // Show UI5 controls
    if (controls.length > 0) {
        response += `🎛️ **UI5 Controls:**\n`;
        for (const ctrl of controls.slice(0, 5)) {
            response += `⭐️ **${ctrl.docTitle}** - \`${ctrl.docId}\`\n`;
            response += `   ${ctrl.docDescription.substring(0, 100)}${ctrl.docDescription.length > 100 ? '...' : ''}\n`;
            response += `   API docs with ${ctrl.snippetCount} code examples\n\n`;
            libraries.add(ctrl.libraryId);
        }
    }
    // Show documentation pages
    if (docs.length > 0) {
        response += `📖 **Documentation:**\n`;
        for (const doc of docs.slice(0, 5)) {
            response += `• **${doc.docTitle}** (${doc.libraryName})\n`;
            response += `  ${doc.docDescription.substring(0, 120)}${doc.docDescription.length > 120 ? '...' : ''}\n`;
            response += `  Use \`${doc.docId}\` in sap_docs_get\n\n`;
            libraries.add(doc.libraryId);
        }
    }
    response += `💡 **Usage:** Use these library IDs with sap_docs_get: ${Array.from(libraries).join(', ')}`;
    return {
        results: [{
                id: 'search-results',
                title: `Search Results for "${query}"`,
                description: response,
                totalSnippets: topResults.reduce((sum, r) => sum + r.snippetCount, 0)
            }]
    };
}
// Helper function to check if a query matches a UI5 control pattern
function isControlMatch(controlName, query) {
    const name = controlName.toLowerCase();
    const q = query.toLowerCase();
    // Check if it's a control name that contains the query
    if (name.includes(q))
        return true;
    // Check for common UI5 control patterns
    const controlParts = name.split('.');
    const lastPart = controlParts[controlParts.length - 1];
    // Check if query matches the control class name
    if (lastPart && lastPart.includes(q))
        return true;
    // Check for common control keywords
    const controlKeywords = ['button', 'table', 'input', 'list', 'panel', 'dialog', 'wizard', 'page', 'app', 'shell', 'toolbar', 'menu'];
    if (controlKeywords.includes(q) && controlKeywords.some(kw => name.includes(kw))) {
        return true;
    }
    return false;
}
export async function fetchLibraryDocumentation(libraryIdOrDocId, topic = "") {
    // Check if this is a community post ID
    if (libraryIdOrDocId.startsWith('community-')) {
        return await getCommunityPost(libraryIdOrDocId);
    }
    const index = await loadIndex();
    // Check if this is a specific document ID
    const allDocs = [];
    for (const lib of Object.values(index)) {
        for (const doc of lib.docs) {
            allDocs.push({ lib, doc });
            // If this matches a specific document ID, return just that document
            if (doc.id === libraryIdOrDocId) {
                let sourcePath;
                if (lib.id === "/sapui5") {
                    sourcePath = "sapui5-docs/docs";
                }
                else if (lib.id === "/cap") {
                    sourcePath = "cap-docs";
                }
                else if (lib.id === "/openui5-api") {
                    sourcePath = "openui5/src";
                }
                else if (lib.id === "/openui5-samples") {
                    sourcePath = "openui5/src";
                }
                else {
                    throw new Error(`Unknown library ID: ${lib.id}`);
                }
                const abs = path.join(PROJECT_ROOT, "sources", sourcePath, doc.relFile);
                const content = await fs.readFile(abs, "utf8");
                // For JavaScript API files, format the content for better readability
                if (doc.relFile && doc.relFile.endsWith('.js') && lib.id === '/openui5-api') {
                    return formatJSDocContent(content, doc.title || '');
                }
                // For sample files, format them appropriately
                else if (lib.id === '/openui5-samples') {
                    return formatSampleContent(content, doc.relFile, doc.title || '');
                }
                else {
                    return content;
                }
            }
        }
    }
    // If not a specific document ID, treat as library ID
    const lib = index[libraryIdOrDocId];
    if (!lib)
        return null;
    const term = topic.toLowerCase();
    const targets = term
        ? lib.docs.filter((d) => d.title.toLowerCase().includes(term) ||
            d.description.toLowerCase().includes(term))
        : lib.docs;
    if (!targets.length)
        return `No topic "${topic}" found inside ${libraryIdOrDocId}.`;
    const parts = [];
    for (const doc of targets) {
        let sourcePath;
        if (lib.id === "/sapui5") {
            sourcePath = "sapui5-docs/docs";
        }
        else if (lib.id === "/cap") {
            sourcePath = "cap-docs";
        }
        else if (lib.id === "/openui5-api") {
            sourcePath = "openui5/src";
        }
        else if (lib.id === "/openui5-samples") {
            sourcePath = "openui5/src";
        }
        else {
            throw new Error(`Unknown library ID: ${lib.id}`);
        }
        const abs = path.join(PROJECT_ROOT, "sources", sourcePath, doc.relFile);
        const content = await fs.readFile(abs, "utf8");
        // For JavaScript API files, format the content for better readability
        if (doc.relFile && doc.relFile.endsWith('.js') && lib.id === '/openui5-api') {
            const formattedContent = formatJSDocContent(content, doc.title || '');
            parts.push(formattedContent);
        }
        // For sample files, format them appropriately
        else if (lib.id === '/openui5-samples') {
            const formattedContent = formatSampleContent(content, doc.relFile, doc.title || '');
            parts.push(formattedContent);
        }
        else {
            parts.push(content);
        }
    }
    return parts.join("\n\n---\n\n");
}
// Resource support for MCP
export async function listDocumentationResources() {
    const index = await loadIndex();
    const resources = [];
    // Add library overview resources
    for (const lib of Object.values(index)) {
        resources.push({
            uri: `sap-docs://${lib.id}`,
            name: `${lib.name} Documentation Overview`,
            description: lib.description,
            mimeType: "text/markdown"
        });
        // Add individual document resources
        for (const doc of lib.docs) {
            resources.push({
                uri: `sap-docs://${lib.id}/${encodeURIComponent(doc.relFile)}`,
                name: doc.title,
                description: `${doc.description} (${doc.snippetCount} code snippets)`,
                mimeType: "text/markdown"
            });
        }
    }
    // Add SAP Community as a searchable resource
    resources.push({
        uri: "sap-docs:///community",
        name: "SAP Community Posts",
        description: "Real-time access to SAP Community blog posts, discussions, and solutions. Search for topics to find community insights and practical solutions.",
        mimeType: "text/markdown"
    });
    return resources;
}
export async function readDocumentationResource(uri) {
    const index = await loadIndex();
    // Handle community overview
    if (uri === "sap-docs:///community") {
        const overview = [
            `# SAP Community`,
            ``,
            `Real-time access to SAP Community blog posts, discussions, and solutions.`,
            ``,
            `## How to Use`,
            ``,
            `1. Use the search function to find community posts on specific topics`,
            `2. Search for terms like "wizard", "button", "authentication", "deployment", etc.`,
            `3. Get access to real-world solutions and community best practices`,
            `4. Use specific community post IDs (e.g., "community-12345") to retrieve full content`,
            ``,
            `## What You'll Find`,
            ``,
            `- **Blog Posts**: Technical tutorials and deep-dives`,
            `- **Solutions**: Answers to common problems`,
            `- **Best Practices**: Community-tested approaches`,
            `- **Code Examples**: Real-world implementations`,
            ``,
            `Community content is filtered to include posts with high engagement (kudos > 5) from SAPUI5 and CAP product areas.`,
            ``,
            `*Note: Community content is fetched in real-time from the SAP Community API.*`
        ].join('\n');
        return {
            contents: [{
                    uri,
                    mimeType: "text/markdown",
                    text: overview
                }]
        };
    }
    // Parse URI: sap-docs://[libraryId]/[optional-file-path]
    const match = uri.match(/^sap-docs:\/\/([^\/]+)(?:\/(.+))?$/);
    if (!match) {
        throw new Error(`Invalid resource URI: ${uri}`);
    }
    const [, libraryId, encodedFilePath] = match;
    const lib = index[libraryId];
    if (!lib) {
        throw new Error(`Library not found: ${libraryId}`);
    }
    // If no file path, return library overview
    if (!encodedFilePath) {
        const overview = [
            `# ${lib.name}`,
            ``,
            `${lib.description}`,
            ``,
            `## Available Documents`,
            ``,
            ...lib.docs.map(doc => `- **${doc.title}**: ${doc.description} (${doc.snippetCount} code snippets)`),
            ``,
            `Total documents: ${lib.docs.length}`,
            `Total code snippets: ${lib.docs.reduce((sum, doc) => sum + doc.snippetCount, 0)}`
        ].join('\n');
        return {
            contents: [{
                    uri,
                    mimeType: "text/markdown",
                    text: overview
                }]
        };
    }
    // Find and return specific document
    const filePath = decodeURIComponent(encodedFilePath);
    const doc = lib.docs.find(d => d.relFile === filePath);
    if (!doc) {
        throw new Error(`Document not found: ${filePath}`);
    }
    let sourcePath;
    if (libraryId === "/sapui5") {
        sourcePath = "sapui5-docs/docs";
    }
    else if (libraryId === "/cap") {
        sourcePath = "cap-docs";
    }
    else if (libraryId === "/openui5-api") {
        sourcePath = "openui5/src";
    }
    else if (libraryId === "/openui5-samples") {
        sourcePath = "openui5/src";
    }
    else {
        throw new Error(`Unknown library ID: ${libraryId}`);
    }
    const absPath = path.join(PROJECT_ROOT, "sources", sourcePath, doc.relFile);
    try {
        const content = await fs.readFile(absPath, "utf8");
        // Format files for better readability
        let formattedContent = content;
        if (doc.relFile && doc.relFile.endsWith('.js') && libraryId === '/openui5-api') {
            formattedContent = formatJSDocContent(content, doc.title || '');
        }
        else if (libraryId === '/openui5-samples') {
            formattedContent = formatSampleContent(content, doc.relFile, doc.title || '');
        }
        return {
            contents: [{
                    uri,
                    mimeType: "text/markdown",
                    text: formattedContent
                }]
        };
    }
    catch (error) {
        throw new Error(`Failed to read document: ${error}`);
    }
}
// Export the community search function for use as a separate tool
export async function searchCommunity(query) {
    try {
        const communityResults = await searchSAPCommunity(query);
        if (communityResults.length === 0) {
            return {
                results: [],
                error: `No SAP Community posts found for "${query}". Try different keywords or check your connection.`
            };
        }
        // Format the results for display
        let response = `Found ${communityResults.length} SAP Community posts for "${query}":\n\n`;
        response += `🌐 **SAP Community Posts:**\n\n`;
        for (const post of communityResults) {
            const postDate = post.postTime ? new Date(post.postTime).toLocaleDateString() : 'Unknown';
            response += `### **${post.title}**\n`;
            response += `**Posted:** ${postDate}\n`;
            response += `**Description:** ${post.description}\n`;
            response += `**URL:** ${post.url}\n`;
            response += `**ID:** \`${post.id}\` (Use this ID with sap_docs_get to view full content)\n\n`;
            response += `---\n\n`;
        }
        response += `💡 **Note:** These results are from the SAP Community and represent real-world developer experiences and solutions. Use the post IDs with sap_docs_get to view the full content.`;
        return {
            results: [{
                    id: 'community-search-results',
                    title: `SAP Community Results for "${query}"`,
                    description: response,
                    totalSnippets: communityResults.length,
                    source: 'community'
                }]
        };
    }
    catch (error) {
        console.error("Error searching SAP Community:", error);
        return {
            results: [],
            error: `Error searching SAP Community: ${error?.message || 'Unknown error'}. Please try again later.`
        };
    }
}
