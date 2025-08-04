import fg from "fast-glob";
import fs from "fs/promises";
import path, { join } from "path";
import matter from "gray-matter";
const SOURCES = [
    {
        repoName: "sapui5-docs",
        absDir: join("sources", "sapui5-docs", "docs"),
        id: "/sapui5",
        name: "SAPUI5",
        description: "Official SAPUI5 Markdown documentation",
        filePattern: "**/*.md",
        type: "markdown"
    },
    {
        repoName: "cap-docs",
        absDir: join("sources", "cap-docs"),
        id: "/cap",
        name: "SAP Cloud Application Programming Model (CAP)",
        description: "CAP (Capire) reference & guides",
        filePattern: "**/*.md",
        type: "markdown"
    },
    {
        repoName: "openui5",
        absDir: join("sources", "openui5", "src"),
        id: "/openui5-api",
        name: "OpenUI5 API",
        description: "OpenUI5 Control API documentation and JSDoc",
        filePattern: "**/src/**/*.js",
        exclude: "**/test/**/*",
        type: "jsdoc"
    },
    {
        repoName: "openui5",
        absDir: join("sources", "openui5", "src"),
        id: "/openui5-samples",
        name: "OpenUI5 Samples",
        description: "OpenUI5 demokit sample applications and code examples",
        filePattern: "**/demokit/sample/**/*.{js,xml,json,html}",
        type: "sample"
    },
    {
        repoName: "wdi5",
        absDir: join("sources", "wdi5", "docs"),
        id: "/wdi5",
        name: "wdi5",
        description: "wdi5 end-to-end test framework documentation",
        filePattern: "**/*.md",
        type: "markdown"
    }
];
// Extract information from sample files (JS, XML, JSON, HTML)
function extractSampleInfo(content, filePath) {
    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath);
    const sampleDir = path.dirname(filePath);
    // Extract control name from the path (e.g., "Button", "Wizard", "Table")
    const pathParts = sampleDir.split('/');
    const sampleIndex = pathParts.findIndex(part => part === 'sample');
    const controlName = sampleIndex >= 0 && sampleIndex < pathParts.length - 1
        ? pathParts[sampleIndex + 1]
        : path.basename(sampleDir);
    let title = `${controlName} Sample - ${fileName}`;
    let description = `Sample implementation of ${controlName} control`;
    let snippetCount = 0;
    // Extract specific information based on file type
    if (fileExt === '.js') {
        // JavaScript sample files
        const jsContent = content.toLowerCase();
        // Look for common UI5 patterns
        if (jsContent.includes('controller')) {
            title = `${controlName} Sample Controller`;
            description = `Controller implementation for ${controlName} sample`;
        }
        else if (jsContent.includes('component')) {
            title = `${controlName} Sample Component`;
            description = `Component definition for ${controlName} sample`;
        }
        // Count meaningful code patterns
        const codePatterns = [
            /function\s*\(/g,
            /onPress\s*:/g,
            /on[A-Z][a-zA-Z]*\s*:/g,
            /\.attach[A-Z][a-zA-Z]*/g,
            /new\s+sap\./g
        ];
        snippetCount = codePatterns.reduce((count, pattern) => {
            return count + (content.match(pattern)?.length || 0);
        }, 0);
    }
    else if (fileExt === '.xml') {
        // XML view files
        title = `${controlName} Sample View`;
        description = `XML view implementation for ${controlName} sample`;
        // Count XML controls and bindings
        const xmlPatterns = [
            /<[a-zA-Z][^>]*>/g,
            /\{[^}]+\}/g, // bindings
            /press=/g,
            /text=/g
        ];
        snippetCount = xmlPatterns.reduce((count, pattern) => {
            return count + (content.match(pattern)?.length || 0);
        }, 0);
    }
    else if (fileExt === '.json') {
        // Manifest or model files
        if (fileName.includes('manifest')) {
            title = `${controlName} Sample Manifest`;
            description = `Application manifest for ${controlName} sample`;
        }
        else {
            title = `${controlName} Sample Data`;
            description = `Sample data model for ${controlName} control`;
        }
        try {
            const jsonObj = JSON.parse(content);
            snippetCount = Object.keys(jsonObj).length;
        }
        catch {
            snippetCount = 1;
        }
    }
    else if (fileExt === '.html') {
        // HTML files
        title = `${controlName} Sample HTML`;
        description = `HTML page for ${controlName} sample`;
        const htmlPatterns = [
            /<script[^>]*>/g,
            /<div[^>]*>/g,
            /data-sap-ui-/g
        ];
        snippetCount = htmlPatterns.reduce((count, pattern) => {
            return count + (content.match(pattern)?.length || 0);
        }, 0);
    }
    // Add library information from path
    const libraryMatch = filePath.match(/src\/([^\/]+)\/test/);
    if (libraryMatch) {
        const library = libraryMatch[1];
        description += ` (${library} library)`;
    }
    return {
        title,
        description,
        snippetCount: Math.max(1, snippetCount) // Ensure at least 1
    };
}
// Extract JSDoc information from JavaScript files with enhanced metadata
function extractJSDocInfo(content, fileName) {
    const lines = content.split(/\r?\n/);
    // Try to find the main class/control definition
    const classMatch = content.match(/\.extend\s*\(\s*["']([^"']+)["']/);
    const fullControlName = classMatch ? classMatch[1] : path.basename(fileName, ".js");
    // Extract namespace and control name
    const namespaceMatch = fullControlName.match(/^(sap\.[^.]+)\.(.*)/);
    const namespace = namespaceMatch ? namespaceMatch[1] : '';
    const controlName = namespaceMatch ? namespaceMatch[2] : fullControlName;
    // Extract main class JSDoc comment
    const jsdocMatch = content.match(/\/\*\*\s*([\s\S]*?)\*\//);
    let description = "";
    if (jsdocMatch) {
        // Clean up JSDoc comment and extract description
        const jsdocContent = jsdocMatch[1]
            .split('\n')
            .map(line => line.replace(/^\s*\*\s?/, ''))
            .join('\n')
            .trim();
        // Extract the main description (everything before @tags)
        const firstAtIndex = jsdocContent.indexOf('@');
        description = firstAtIndex > -1
            ? jsdocContent.substring(0, firstAtIndex).trim()
            : jsdocContent;
        // Clean up common JSDoc patterns
        description = description
            .replace(/^\s*Constructor for a new.*$/m, '')
            .replace(/^\s*@param.*$/gm, '')
            .replace(/^\s*@.*$/gm, '')
            .replace(/\n\s*\n/g, '\n')
            .trim();
    }
    // Extract properties, events, aggregations with better parsing
    const properties = [];
    const events = [];
    const aggregations = [];
    const keywords = [];
    // Extract properties
    const propertiesSection = content.match(/properties\s*:\s*\{([\s\S]*?)\n\s*\}/);
    if (propertiesSection) {
        const propMatches = propertiesSection[1].matchAll(/(\w+)\s*:\s*\{/g);
        for (const match of propMatches) {
            properties.push(match[1]);
        }
    }
    // Extract events  
    const eventsSection = content.match(/events\s*:\s*\{([\s\S]*?)\n\s*\}/);
    if (eventsSection) {
        const eventMatches = eventsSection[1].matchAll(/(\w+)\s*:\s*\{/g);
        for (const match of eventMatches) {
            events.push(match[1]);
        }
    }
    // Extract aggregations
    const aggregationsSection = content.match(/aggregations\s*:\s*\{([\s\S]*?)\n\s*\}/);
    if (aggregationsSection) {
        const aggMatches = aggregationsSection[1].matchAll(/(\w+)\s*:\s*\{/g);
        for (const match of aggMatches) {
            aggregations.push(match[1]);
        }
    }
    // Generate keywords based on control name and content
    keywords.push(controlName.toLowerCase());
    if (namespace)
        keywords.push(namespace);
    if (fullControlName !== controlName)
        keywords.push(fullControlName);
    // Add common UI5 control keywords based on control name
    const controlLower = controlName.toLowerCase();
    if (controlLower.includes('wizard'))
        keywords.push('wizard', 'step', 'multi-step', 'process');
    if (controlLower.includes('button'))
        keywords.push('button', 'click', 'press', 'action');
    if (controlLower.includes('table'))
        keywords.push('table', 'grid', 'data', 'row', 'column');
    if (controlLower.includes('dialog'))
        keywords.push('dialog', 'popup', 'modal', 'overlay');
    if (controlLower.includes('input'))
        keywords.push('input', 'field', 'text', 'form');
    if (controlLower.includes('list'))
        keywords.push('list', 'item', 'collection');
    if (controlLower.includes('panel'))
        keywords.push('panel', 'container', 'layout');
    if (controlLower.includes('page'))
        keywords.push('page', 'navigation', 'view');
    // Add property/event-based keywords
    if (properties.includes('text'))
        keywords.push('text');
    if (properties.includes('value'))
        keywords.push('value');
    if (events.includes('press'))
        keywords.push('press', 'click');
    if (events.includes('change'))
        keywords.push('change', 'update');
    // Count code blocks and property definitions
    const codeBlockCount = (content.match(/```/g)?.length || 0) / 2;
    const propertyCount = properties.length + events.length + aggregations.length;
    return {
        title: fullControlName,
        description: description || `OpenUI5 control: ${fullControlName}`,
        snippetCount: Math.max(1, codeBlockCount + Math.floor(propertyCount / 3)),
        controlName,
        namespace,
        keywords: [...new Set(keywords)],
        properties,
        events,
        aggregations
    };
}
async function main() {
    await fs.mkdir("data", { recursive: true });
    const all = {};
    for (const src of SOURCES) {
        const patterns = [src.filePattern];
        if (src.exclude) {
            patterns.push(`!${src.exclude}`);
        }
        const files = await fg(patterns, { cwd: src.absDir, absolute: true });
        const docs = [];
        for (const absPath of files) {
            const rel = path.relative(src.absDir, absPath).replace(/\\/g, "/");
            const raw = await fs.readFile(absPath, "utf8");
            let title;
            let description;
            let snippetCount;
            let id;
            if (src.type === "markdown") {
                // Handle markdown files
                const { content } = matter(raw); // strip front-matter if any
                const lines = content.split(/\r?\n/);
                title = lines.find((l) => l.startsWith("# "))?.slice(2).trim() ||
                    path.basename(rel, ".md");
                description = lines.find((l) => l.trim() && !l.startsWith("#"))?.trim() || "";
                snippetCount = (content.match(/```/g)?.length || 0) / 2;
                id = `${src.id}/${rel.replace(/\.md$/, "")}`;
            }
            else if (src.type === "jsdoc") {
                // Handle JavaScript files with JSDoc
                const jsDocInfo = extractJSDocInfo(raw, path.basename(absPath));
                title = jsDocInfo.title;
                description = jsDocInfo.description;
                snippetCount = jsDocInfo.snippetCount;
                id = `${src.id}/${rel.replace(/\.js$/, "")}`;
                // Skip files that don't look like UI5 controls
                if (!raw.includes('.extend') || !raw.includes('metadata')) {
                    continue;
                }
                docs.push({
                    id,
                    title,
                    description,
                    snippetCount,
                    relFile: rel,
                    type: src.type,
                    controlName: jsDocInfo.controlName,
                    namespace: jsDocInfo.namespace,
                    keywords: jsDocInfo.keywords,
                    properties: jsDocInfo.properties,
                    events: jsDocInfo.events,
                    aggregations: jsDocInfo.aggregations
                });
            }
            else if (src.type === "sample") {
                // Handle sample files (JS, XML, JSON, HTML)
                const sampleInfo = extractSampleInfo(raw, rel);
                title = sampleInfo.title;
                description = sampleInfo.description;
                snippetCount = sampleInfo.snippetCount;
                id = `${src.id}/${rel.replace(/\.(js|xml|json|html)$/, "")}`;
                // Skip empty files or non-meaningful samples
                if (raw.trim().length < 50) {
                    continue;
                }
                // Extract control name from sample path for better searchability
                const pathParts = rel.split('/');
                const sampleIndex = pathParts.findIndex(part => part === 'sample');
                const controlName = sampleIndex >= 0 && sampleIndex < pathParts.length - 1
                    ? pathParts[sampleIndex + 1]
                    : path.basename(path.dirname(rel));
                // Generate sample keywords
                const keywords = [controlName.toLowerCase(), 'sample', 'example'];
                if (rel.includes('.xml'))
                    keywords.push('view', 'xml');
                if (rel.includes('.js'))
                    keywords.push('controller', 'javascript');
                if (rel.includes('.json'))
                    keywords.push('model', 'data', 'configuration');
                if (rel.includes('manifest'))
                    keywords.push('manifest', 'app');
                docs.push({
                    id,
                    title,
                    description,
                    snippetCount,
                    relFile: rel,
                    type: src.type,
                    controlName,
                    keywords: [...new Set(keywords)]
                });
            }
            else {
                continue; // Skip unknown file types
            }
            // For markdown files, still use the basic structure
            if (src.type === "markdown") {
                docs.push({
                    id,
                    title,
                    description,
                    snippetCount,
                    relFile: rel,
                    type: src.type
                });
            }
        }
        const bundle = {
            id: src.id,
            name: src.name,
            description: src.description,
            docs
        };
        all[src.id] = bundle;
        await fs.writeFile(`data${src.id}.json`.replace(/\//g, "_"), JSON.stringify(bundle, null, 2));
    }
    await fs.writeFile("data/index.json", JSON.stringify(all, null, 2));
    console.log("✅  Index built with", Object.keys(all).length, "libraries.");
}
main();
