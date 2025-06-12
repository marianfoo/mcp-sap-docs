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
        filePattern: "**/*.js",
        type: "jsdoc"
    },
    {
        repoName: "openui5",
        absDir: join("sources", "openui5", "src"),
        id: "/openui5-samples",
        name: "OpenUI5 Samples",
        description: "OpenUI5 sample code and demo implementations",
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
// Extract JSDoc information from JavaScript files
function extractJSDocInfo(content, fileName) {
    const lines = content.split(/\r?\n/);
    // Try to find the main class/control definition
    const classMatch = content.match(/\.extend\s*\(\s*["']([^"']+)["']/);
    const controlName = classMatch ? classMatch[1] : path.basename(fileName, ".js");
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
    // Count properties, methods, aggregations, etc.
    const propertyMatches = content.match(/^\s*properties\s*:\s*\{/m);
    const eventMatches = content.match(/^\s*events\s*:\s*\{/m);
    const aggregationMatches = content.match(/^\s*aggregations\s*:\s*\{/m);
    const associationMatches = content.match(/^\s*associations\s*:\s*\{/m);
    // Count code blocks and property definitions
    const codeBlockCount = (content.match(/```/g)?.length || 0) / 2;
    const propertyCount = content.match(/^\s*[a-zA-Z][a-zA-Z0-9]*\s*:\s*\{/gm)?.length || 0;
    return {
        title: controlName,
        description: description || `OpenUI5 control: ${controlName}`,
        snippetCount: codeBlockCount + Math.floor(propertyCount / 5) // Estimate based on properties
    };
}
async function main() {
    await fs.mkdir("data", { recursive: true });
    const all = {};
    for (const src of SOURCES) {
        const files = await fg([src.filePattern], { cwd: src.absDir, absolute: true });
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
            }
            else {
                continue; // Skip unknown file types
            }
            docs.push({
                id,
                title,
                description,
                snippetCount,
                relFile: rel,
                type: src.type
            });
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
