import fg from "fast-glob";
import fs from "fs/promises";
import path, { join } from "path";
import matter from "gray-matter";

interface DocEntry {
  id: string;              // "/sapui5/<rel-path>", "/cap/<rel-path>", "/openui5-api/<rel-path>", or "/openui5-samples/<rel-path>"
  title: string;
  description: string;
  snippetCount: number;
  relFile: string;         // path relative to sources/…
  type?: "markdown" | "jsdoc" | "sample" | "markdown-section";  // type of documentation
  controlName?: string;    // extracted UI5 control name (e.g., "Wizard", "Button")
  namespace?: string;      // UI5 namespace (e.g., "sap.m", "sap.f")
  keywords?: string[];     // searchable keywords and tags
  properties?: string[];   // control properties for API docs
  events?: string[];       // control events for API docs
  aggregations?: string[]; // control aggregations for API docs
  parentDocument?: string; // for sections, the ID of the parent document
  sectionStartLine?: number; // for sections, the line number where the section starts
  headingLevel?: number;   // for sections, the heading level (2=##, 3=###, 4=####)
}

interface LibraryBundle {
  id: string;              // "/sapui5" | "/cap" | "/openui5-api" | "/openui5-samples"
  name: string;            // "SAPUI5", "CAP", "OpenUI5 API", "OpenUI5 Samples"
  description: string;
  docs: DocEntry[];
}

interface SourceConfig {
  repoName: string;
  absDir: string;
  id: string;
  name: string;
  description: string;
  filePattern: string;
  exclude?: string;
  type: "markdown" | "jsdoc" | "sample";
}

const SOURCES: SourceConfig[] = [
  {
    repoName: "sapui5-docs",
    absDir: join("sources", "sapui5-docs", "docs"),
    id: "/sapui5",
    name: "SAPUI5",
    description: "Official SAPUI5 Markdown documentation",
    filePattern: "**/*.md",
    type: "markdown" as const
  },
  {
    repoName: "cap-docs",
    absDir: join("sources", "cap-docs"),
    id: "/cap",
    name: "SAP Cloud Application Programming Model (CAP)",
    description: "CAP (Capire) reference & guides",
    filePattern: "**/*.md",
    type: "markdown" as const
  },
  {
    repoName: "openui5",
    absDir: join("sources", "openui5", "src"),
    id: "/openui5-api",
    name: "OpenUI5 API",
    description: "OpenUI5 Control API documentation and JSDoc",
    filePattern: "**/src/**/*.js",
    exclude: "**/test/**/*",
    type: "jsdoc" as const
  },
  {
    repoName: "openui5",
    absDir: join("sources", "openui5", "src"),
    id: "/openui5-samples",
    name: "OpenUI5 Samples", 
    description: "OpenUI5 demokit sample applications and code examples",
    filePattern: "**/demokit/sample/**/*.{js,xml,json,html}",
    type: "sample" as const
  },
  {
    repoName: "wdi5",
    absDir: join("sources", "wdi5", "docs"),
    id: "/wdi5",
    name: "wdi5",
    description: "wdi5 end-to-end test framework documentation",
    filePattern: "**/*.md",
    type: "markdown" as const
  },
  {
    repoName: "ui5-tooling",
    absDir: join("sources", "ui5-tooling", "docs"),
    id: "/ui5-tooling",
    name: "UI5 Tooling ",
    description: "UI5 Tooling documentation",
    filePattern: "**/*.md",
    type: "markdown" as const
  },
  {
    repoName: "cloud-mta-build-tool",
    absDir: join("sources", "cloud-mta-build-tool", "docs", "docs"),
    id: "/cloud-mta-build-tool",
    name: "Cloud MTA Build Tool",
    description: "Cloud MTA Build Tool documentation",
    filePattern: "**/*.md",
    type: "markdown" as const
  },
  {
    repoName: "ui5-webcomponents",
    absDir: join("sources", "ui5-webcomponents", "docs"),
    id: "/ui5-webcomponents",
    name: "UI5 Web Components",
    description: "UI5 Web Components documentation",
    filePattern: "**/*.md",
    type: "markdown" as const
  },
  {
    repoName: "cloud-sdk",
    absDir: join("sources", "cloud-sdk", "docs-js"),
    id: "/cloud-sdk-js",
    name: "Cloud SDK (JavaScript)",
    description: "Cloud SDK (JavaScript) documentation",
    filePattern: "**/*.mdx",
    type: "markdown" as const
  },
  {
    repoName: "cloud-sdk",
    absDir: join("sources", "cloud-sdk", "docs-java"),
    id: "/cloud-sdk-java",
    name: "Cloud SDK (Java)",
    description: "Cloud SDK (Java) documentation",
    filePattern: "**/*.mdx",
    type: "markdown" as const
  }
];

// Extract information from sample files (JS, XML, JSON, HTML)
function extractSampleInfo(content: string, filePath: string) {
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
    } else if (jsContent.includes('component')) {
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
    
  } else if (fileExt === '.xml') {
    // XML view files
    title = `${controlName} Sample View`;
    description = `XML view implementation for ${controlName} sample`;
    
    // Count XML controls and bindings
    const xmlPatterns = [
      /<[a-zA-Z][^>]*>/g,
      /\{[^}]+\}/g,  // bindings
      /press=/g,
      /text=/g
    ];
    
    snippetCount = xmlPatterns.reduce((count, pattern) => {
      return count + (content.match(pattern)?.length || 0);
    }, 0);
    
  } else if (fileExt === '.json') {
    // Manifest or model files
    if (fileName.includes('manifest')) {
      title = `${controlName} Sample Manifest`;
      description = `Application manifest for ${controlName} sample`;
    } else {
      title = `${controlName} Sample Data`;
      description = `Sample data model for ${controlName} control`;
    }
    
    try {
      const jsonObj = JSON.parse(content);
      snippetCount = Object.keys(jsonObj).length;
    } catch {
      snippetCount = 1;
    }
    
  } else if (fileExt === '.html') {
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
function extractJSDocInfo(content: string, fileName: string) {
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
  const properties: string[] = [];
  const events: string[] = [];
  const aggregations: string[] = [];
  const keywords: string[] = [];
  
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
  if (namespace) keywords.push(namespace);
  if (fullControlName !== controlName) keywords.push(fullControlName);
  
  // Add common UI5 control keywords based on control name
  const controlLower = controlName.toLowerCase();
  if (controlLower.includes('wizard')) keywords.push('wizard', 'step', 'multi-step', 'process');
  if (controlLower.includes('button')) keywords.push('button', 'click', 'press', 'action');
  if (controlLower.includes('table')) keywords.push('table', 'grid', 'data', 'row', 'column');
  if (controlLower.includes('dialog')) keywords.push('dialog', 'popup', 'modal', 'overlay');
  if (controlLower.includes('input')) keywords.push('input', 'field', 'text', 'form');
  if (controlLower.includes('list')) keywords.push('list', 'item', 'collection');
  if (controlLower.includes('panel')) keywords.push('panel', 'container', 'layout');
  if (controlLower.includes('page')) keywords.push('page', 'navigation', 'view');
  
  // Add property/event-based keywords
  if (properties.includes('text')) keywords.push('text');
  if (properties.includes('value')) keywords.push('value');
  if (events.includes('press')) keywords.push('press', 'click');
  if (events.includes('change')) keywords.push('change', 'update');
  
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

function extractMarkdownSections(content: string, lines: string[], src: any, relFile: string, docs: DocEntry[]) {
  const sections: { title: string; content: string; startLine: number; level: number }[] = [];
  let currentSection: { title: string; content: string; startLine: number; level: number } | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for headings (##, ###, ####)
    let headingLevel = 0;
    let headingText = '';
    
    if (line.startsWith('#### ')) {
      headingLevel = 4;
      headingText = line.slice(5).trim();
    } else if (line.startsWith('### ')) {
      headingLevel = 3;
      headingText = line.slice(4).trim();
    } else if (line.startsWith('## ')) {
      headingLevel = 2;
      headingText = line.slice(3).trim();
    }
    
    if (headingLevel > 0) {
      // Save previous section if it exists
      if (currentSection) {
        sections.push(currentSection);
      }
      
      // Start new section
      currentSection = {
        title: headingText,
        content: '',
        startLine: i,
        level: headingLevel
      };
    } else if (currentSection) {
      // Add content to current section
      currentSection.content += line + '\n';
    }
  }
  
  // Add the last section
  if (currentSection) {
    sections.push(currentSection);
  }
  
  // Create separate docs entries for meaningful sections
  for (const section of sections) {
    // Skip very short sections or those with placeholder titles
    if (section.content.trim().length < 100 || section.title.length < 3) {
      continue;
    }
    
    // Generate description from first few sentences of section content
    const contentLines = section.content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const description = contentLines.slice(0, 3).join(' ').trim() || section.title;
    
    // Count code snippets in this section
    const snippetCount = (section.content.match(/```/g)?.length || 0) / 2;
    
    // Create section entry
    const sectionId = `${src.id}/${relFile.replace(/\.md$/, "")}#${section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    
    docs.push({
      id: sectionId,
      title: section.title,
      description: description.substring(0, 300) + (description.length > 300 ? '...' : ''),
      snippetCount,
      relFile,
      type: 'markdown-section' as any,
      parentDocument: `${src.id}/${relFile.replace(/\.md$/, "")}`,
      sectionStartLine: section.startLine,
      headingLevel: section.level
    });
  }
}

async function main() {
  await fs.mkdir("dist/data", { recursive: true });
  const all: Record<string, LibraryBundle> = {};

  for (const src of SOURCES) {
    const patterns = [src.filePattern];
    if (src.exclude) {
      patterns.push(`!${src.exclude}`);
    }
    const files = await fg(patterns, { cwd: src.absDir, absolute: true });

    const docs: DocEntry[] = [];

    for (const absPath of files) {
      const rel = path.relative(src.absDir, absPath).replace(/\\/g, "/");
      const raw = await fs.readFile(absPath, "utf8");


      let title: string;
      let description: string;
      let snippetCount: number;
      let id: string;

      if (src.type === "markdown") {
        // Handle markdown files
        const { content, data: frontmatter } = matter(raw);
        const lines = content.split(/\r?\n/);

        title = lines.find((l) => l.startsWith("# "))?.slice(2).trim() ||
                path.basename(rel, ".md");
        
        // Try to get description from frontmatter synopsis first, then fall back to content
        let rawDescription = lines.find((l) => l.trim() && !l.startsWith("#"))?.trim() || "";
        if (frontmatter?.synopsis && rawDescription.includes("{{ $frontmatter.synopsis }}")) {
          description = frontmatter.synopsis;
        } else {
          description = rawDescription;
        }
        
        snippetCount = (content.match(/```/g)?.length || 0) / 2;
        id = `${src.id}/${rel.replace(/\.md$/, "")}`;
        
        // Extract individual sections as separate entries for all markdown docs
        if (content.includes('##')) {
          extractMarkdownSections(content, lines, src, rel, docs);
        }
      } else if (src.type === "jsdoc") {
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
        
      } else if (src.type === "sample") {
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
        if (rel.includes('.xml')) keywords.push('view', 'xml');
        if (rel.includes('.js')) keywords.push('controller', 'javascript');
        if (rel.includes('.json')) keywords.push('model', 'data', 'configuration');
        if (rel.includes('manifest')) keywords.push('manifest', 'app');
        
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
        
      } else {
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

    const bundle: LibraryBundle = {
      id: src.id,
      name: src.name,
      description: src.description,
      docs
    };

    all[src.id] = bundle;
    await fs.writeFile(
      path.join("dist", "data", `data${src.id}.json`.replace(/\//g, "_")),
      JSON.stringify(bundle, null, 2)
    );
  }

  await fs.writeFile("dist/data/index.json", JSON.stringify(all, null, 2));
  console.log("✅  Index built with", Object.keys(all).length, "libraries.");
}

main(); 