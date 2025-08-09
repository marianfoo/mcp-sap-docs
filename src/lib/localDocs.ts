// src/lib/localDocs.ts
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SearchResponse, SearchResult } from "./types.js";
import { getFTSCandidateIds, getFTSStats } from "./searchDb.js";
import { searchCommunityBestMatch, getCommunityPostByUrl, getCommunityPostById, getCommunityPostsByIds, searchAndGetTopPosts, BestMatchHit } from "./communityBestMatch.js";

// Documentation URL configuration for different libraries
interface DocUrlConfig {
  baseUrl: string;
  pathPattern: string; // How to construct the path: {file} or {file}#{anchor}
  anchorStyle: 'docsify' | 'github' | 'custom'; // How anchors are formatted
}

const DOC_URL_CONFIGS: Record<string, DocUrlConfig> = {
  '/wdi5': {
    baseUrl: 'https://ui5-community.github.io/wdi5',
    pathPattern: '#{file}',
    anchorStyle: 'docsify'
  },
  '/cap': {
    baseUrl: 'https://cap.cloud.sap',
    pathPattern: '/docs/{file}',
    anchorStyle: 'docsify'
  },
  '/sapui5': {
    baseUrl: 'https://ui5.sap.com',
    pathPattern: '/#/topic/{file}',
    anchorStyle: 'custom'
  },
  '/openui5-api': {
    baseUrl: 'https://ui5.sap.com',
    pathPattern: '/#/api/{file}',
    anchorStyle: 'custom'
  }
};

// Generic function to generate documentation URLs
function generateDocumentationUrl(libraryId: string, relFile: string, content: string): string | null {
  const config = DOC_URL_CONFIGS[libraryId];
  if (!config) {
    return null;
  }

  // Convert file path to URL path
  const fileName = relFile.replace(/\.md$/, '');
  let urlPath = config.pathPattern.replace('{file}', fileName);
  
  // Try to detect the most relevant section in the content for anchor
  const anchor = detectContentSection(content, config.anchorStyle);
  if (anchor) {
    const separator = config.anchorStyle === 'docsify' ? '?id=' : '#';
    urlPath += separator + anchor;
  }
  
  return config.baseUrl + urlPath;
}

// Detect the main section/topic from content
function detectContentSection(content: string, anchorStyle: 'docsify' | 'github' | 'custom'): string | null {
  // Find the first major heading (## or #) that gives context about the content
  const headingMatch = content.match(/^#{1,2}\s+(.+)$/m);
  if (!headingMatch) {
    return null;
  }
  
  const heading = headingMatch[1].trim();
  
  // Convert heading to anchor format based on style
  switch (anchorStyle) {
    case 'docsify':
      // Docsify format: lowercase, spaces to hyphens, remove special chars
      return heading
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens
        .replace(/\s+/g, '-')     // Spaces to hyphens
        .replace(/-+/g, '-')      // Multiple hyphens to single
        .replace(/^-|-$/g, '');   // Remove leading/trailing hyphens
        
    case 'github':
      // GitHub format: lowercase, spaces to hyphens, keep some special chars
      return heading
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
        
    case 'custom':
    default:
      // Return as-is for custom handling
      return heading;
  }
}

// Get the directory of this script and find the project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find project root by looking for package.json
let PROJECT_ROOT = __dirname;
while (PROJECT_ROOT !== path.dirname(PROJECT_ROOT)) {
  try {
    if (existsSync(path.join(PROJECT_ROOT, 'package.json'))) {
      break;
    }
  } catch {
    // Continue searching
  }
  PROJECT_ROOT = path.dirname(PROJECT_ROOT);
}

// Fallback: assume dist structure
if (!existsSync(path.join(PROJECT_ROOT, 'package.json'))) {
  PROJECT_ROOT = path.resolve(__dirname, "../../..");
}

const DATA_DIR = path.join(PROJECT_ROOT, "dist", "data");

// Note: SAP Community search now uses HTML scraping via communityBestMatch.ts

// Search SAP Community for relevant posts using HTML scraping
async function searchSAPCommunity(query: string): Promise<SearchResult[]> {
  try {
    const hits: BestMatchHit[] = await searchCommunityBestMatch(query, {
      includeBlogs: true,
      limit: 10,
      userAgent: 'SAP-Docs-MCP/1.0'
    });

    return hits.map(hit => ({
      id: hit.postId ? `community-${hit.postId}` : `community-url-${encodeURIComponent(hit.url)}`,
      title: hit.title,
      description: hit.snippet || '',
      totalSnippets: 1,
      source: 'community',
      url: hit.url,
      postTime: hit.published,
      author: hit.author,
      likes: hit.likes,
      tags: hit.tags
    }));
  } catch (error) {
    console.warn('Failed to search SAP Community:', error);
    return [];
  }
}

// Get full content of a community post using LiQL API
async function getCommunityPost(postId: string): Promise<string | null> {
  try {
    // Handle both postId formats: "community-postId" and "community-url-encodedUrl"
    if (postId.startsWith('community-url-')) {
      // Extract URL from encoded format and fall back to URL scraping
      const encodedUrl = postId.replace('community-url-', '');
      const postUrl = decodeURIComponent(encodedUrl);
      return await getCommunityPostByUrl(postUrl, 'SAP-Docs-MCP/1.0');
    } else {
      // For standard post IDs, use the efficient LiQL API
      const numericId = postId.replace('community-', '');
      return await getCommunityPostById(numericId, 'SAP-Docs-MCP/1.0');
    }
  } catch (error) {
    console.warn('Failed to get community post:', error);
    return null;
  }
}

// Format JavaScript content for better readability in documentation context
function formatJSDocContent(content: string, controlName: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  
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
function formatSampleContent(content: string, filePath: string, title: string): string {
  const fileExt = path.extname(filePath);
  const controlName = title.split(' ')[0]; // Extract control name from title
  const fileName = path.basename(filePath);
  
  const result: string[] = [];
  
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
    } else if (content.toLowerCase().includes('component')) {
      result.push(`## Component Definition`);
      result.push(`This file defines the application component for the ${controlName} sample.`);
    } else {
      result.push(`## JavaScript Implementation`);
      result.push(`This file contains JavaScript code for the ${controlName} sample.`);
    }
  } else if (fileExt === '.xml') {
    result.push(`## XML View`);
    result.push(`This file contains the XML view definition for the ${controlName} sample.`);
  } else if (fileExt === '.json') {
    result.push(`## JSON Configuration`);
    if (fileName.includes('manifest')) {
      result.push(`This file contains the application manifest configuration.`);
    } else {
      result.push(`This file contains JSON configuration or sample data.`);
    }
  } else if (fileExt === '.html') {
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

function getFileTypeDescription(ext: string): string {
  switch (ext) {
    case '.js': return 'JavaScript';
    case '.xml': return 'XML View';
    case '.json': return 'JSON Configuration';
    case '.html': return 'HTML Page';
    default: return 'File';
  }
}

function getSyntaxHighlighting(ext: string): string {
  switch (ext) {
    case '.js': return 'javascript';
    case '.xml': return 'xml';
    case '.json': return 'json';
    case '.html': return 'html';
    default: return 'text';
  }
}

type LibraryBundle = {
  id: string;
  name: string;
  description: string;
  docs: {
    id: string;
    title: string;
    description: string;
    snippetCount: number;
    relFile: string;
  }[];
};

let INDEX: Record<string, LibraryBundle> | null = null;

async function loadIndex() {
  if (!INDEX) {
    const raw = await fs.readFile(path.join(DATA_DIR, "index.json"), "utf8");
    INDEX = JSON.parse(raw) as Record<string, LibraryBundle>;
  }
  return INDEX;
}

// Utility: Expand query with synonyms and related terms
function expandQuery(query: string): string[] {
  const synonyms: Record<string, string[]> = {
    // === UI5 CONTROL TERMS ===
    // Wizard-related terms (UI5 only)
    wizard: ["wizard", "sap.m.Wizard", "WizardStep", "sap.m.WizardStep", "WizardRenderMode", 
             "sap.ui.webc.fiori.IWizardStep", "sap.ui.webc.fiori.WizardContentLayout", 
             "wizard control", "wizard fragment", "wizard step", "step wizard", "multi-step"],
    
    // Button-related terms (UI5 + general)
    button: ["button", "sap.m.Button", "sap.ui.webc.main.Button", "button control", 
             "button press", "action button", "toggle button", "click", "press event"],
    
    // Table-related terms (UI5 + CAP)
    table: ["table", "sap.m.Table", "sap.ui.table.Table", "sap.ui.table.TreeTable", 
            "table control", "table row", "data table", "tree table", "grid table",
            "entity", "table entity", "database table", "cds table"],
    
    // === CAP-SPECIFIC TERMS ===
    // CDS and modeling
    cds: ["cds", "Core Data Services", "cds model", "cds file", "schema", "data model",
          "entity", "service", "view", "type", "aspect", "composition", "association"],
    
    entity: ["entity", "cds entity", "data entity", "business entity", "table", 
             "model", "schema", "composition", "association", "key", "managed"],
    
    service: ["service", "cds service", "odata service", "rest service", "api", 
              "endpoint", "business service", "application service", "crud"],
    
    aspect: ["aspect", "cds aspect", "managed", "cuid", "audited", 
             "reuse aspect", "mixin", "common aspect"],
    
    temporal: ["temporal", "temporal data", "time slice", "valid from", "valid to", 
               "temporal entity", "temporal aspect", "time travel", "as-of-now"],
    
    annotation: ["annotation", "annotations", "@", "annotation file", "annotation target",
                 "UI annotation", "Common annotation", "Capabilities annotation", 
                 "odata annotation", "fiori annotation"],
    
    // CAP Authentication & Security  
    auth: ["authentication", "authorization", "auth", "security", "user", "role", 
           "scopes", "jwt", "oauth", "saml", "xsuaa", "ias", "passport", "login"],
    
    // CAP Database & Persistence
    database: ["database", "db", "hana", "sqlite", "postgres", "h2", "persistence",
               "connection", "schema", "migration", "deploy"],
    
    deployment: ["deployment", "deploy", "cf push", "cloud foundry", "kubernetes", 
                 "helm", "docker", "mta", "build", "production"],
    
    // === WDI5-SPECIFIC TERMS ===
    testing: ["testing", "test", "e2e", "end-to-end", "integration test", "ui test",
              "browser test", "selenium", "webdriver", "automation", "test framework"],
    
    wdi5: ["wdi5", "webdriver", "ui5 testing", "browser automation", "page object", 
           "test framework", "selector", "locator", "element", "assertion", "wdio",
           "ui5 test api", "sap.ui.test", "test library", "fe-testlib"],
    
    selector: ["selector", "locator", "element", "control selector", "id", "property",
               "binding", "aggregation", "wdi5 selector", "ui5 control", "matcher",
               "sap.ui.test.matchers", "byId", "byProperty", "byBinding"],
    
    browser: ["browser", "chrome", "firefox", "safari", "webdriver", "headless",
              "viewport", "screenshot", "debugging", "browser automation"],
    
    pageobject: ["page object", "pageobject", "page objects", "test structure", 
                 "test organization", "test patterns", "ui5 test patterns"],
    
    // === CROSS-PLATFORM TERMS ===
    // Navigation & Routing (UI5 + CAP)
    routing: ["routing", "router", "navigation", "route", "target", "pattern",
              "manifest routing", "app router", "destination"],
    
    // Forms (UI5 + CAP + wdi5)
    form: ["form", "sap.ui.layout.form.Form", "sap.ui.layout.form.SimpleForm",
           "form control", "form layout", "smart form", "input validation", 
           "form testing"],
    
    // Data & Models (UI5 + CAP)
    model: ["model", "data model", "json model", "odata model", "entity model",
            "binding", "property binding", "aggregation binding"],
    
    // Fiori & Elements
    fiori: ["fiori", "fiori elements", "list report", "object page", "overview page",
            "analytical list page", "worklist", "freestyle fiori", "fiori launchpad"],
    
    // Development & Tools
    development: ["development", "dev", "local", "debugging", "console", "devtools",
                  "hot reload", "live reload", "build", "compile"]
  };
  
  const q = query.toLowerCase().trim();
  
  // Check for exact matches first
  for (const [key, values] of Object.entries(synonyms)) {
    if (q === key || values.some(v => v.toLowerCase() === q)) {
      return values;
    }
  }
  
  // Generic approach: Build smart query variations with term prioritization
  const queryTerms = q.toLowerCase().split(/\s+/);
  const importantMatches: string[] = [];
  const supplementaryMatches: string[] = [];
  let hasSpecificMatch = false;
  
  for (const [key, values] of Object.entries(synonyms)) {
    // Check if query contains this key term
    if (q.includes(key) || values.some(v => q.includes(v.toLowerCase()))) {
      // If the key term is a major word in the query, prioritize it
      if (queryTerms.includes(key) || queryTerms.some(term => term.length > 3 && key.includes(term))) {
        importantMatches.unshift(...values);
        hasSpecificMatch = true;
      } else {
        // Minor/partial matches go to supplementary
        supplementaryMatches.push(...values);
      }
    }
  }
  
  if (importantMatches.length > 0 || supplementaryMatches.length > 0) {
    // Always start with original query variations, then important matches, then supplementary
    const result = [
      query, // Original exact query first
      query.toLowerCase(),
      ...new Set(importantMatches), // Important domain-specific terms
      ...new Set(supplementaryMatches.slice(0, 5)) // Limit supplementary to avoid pollution
    ];
    return result;
  }
  
  // Handle common UI5 control patterns
  const ui5ControlPattern = /^sap\.[a-z]+\.[A-Z][a-zA-Z0-9]*$/;
  if (ui5ControlPattern.test(query)) {
    const controlName = query.split('.').pop()!;
    return [query, controlName, controlName.toLowerCase(), `${controlName} control`];
  }
  
  // Generate contextual variations based on query type
  const variations = [query, query.toLowerCase()];
  
  // Add technology-specific variations
  if (q.includes('cap') || q.includes('cds')) {
    variations.push('CAP', 'cds', 'Core Data Services', 'service', 'entity');
  }
  if (q.includes('wdi5') || q.includes('test') || q.includes('testing') || q.includes('e2e')) {
    variations.push('wdi5', 'testing', 'e2e', 'webdriver', 'ui5 testing', 'wdio', 'pageobject', 'selector', 'locator');
  }
  if (q.includes('ui5') || q.includes('sap.')) {
    variations.push('UI5', 'SAPUI5', 'OpenUI5', 'control', 'Fiori');
  }
  
  // Add common variations
  variations.push(
    query.charAt(0).toUpperCase() + query.slice(1).toLowerCase(),
    query.replace(/[_-]/g, ' '),
    query.replace(/\s+/g, ''),
    ...query.split(/[_\s-]/).filter(part => part.length > 2)
  );
  
  return [...new Set(variations)];
}

// Utility: Extract control names/properties from file content (XML/JS)
function extractControlsFromContent(content: string): string[] {
  const controls = new Set<string>();
  
  // XML: <sap.m.Wizard ...> or <Wizard ...>
  const xmlMatches = content.matchAll(/<([a-zA-Z0-9_.:]+)[\s>]/g);
  for (const m of xmlMatches) {
    let tag = m[1];
    if (tag.includes(":")) tag = tag.split(":").pop()!;
    controls.add(tag);
  }
  
  // JS: Enhanced pattern matching for all UI5 namespaces
  const sapNamespaces = ['sap.m', 'sap.ui', 'sap.f', 'sap.tnt', 'sap.suite', 'sap.viz', 'sap.uxap'];
  for (const namespace of sapNamespaces) {
    const pattern = new RegExp(`${namespace.replace('.', '\\.')}\.([A-Za-z0-9_]+)`, 'g');
    const matches = content.matchAll(pattern);
    for (const m of matches) {
      controls.add(`${namespace}.${m[1]}`);
      controls.add(m[1]); // Also add just the control name
    }
  }
  
  // Extract from extend() calls
  const extendMatches = content.matchAll(/\.extend\s*\(\s*["']([^"']+)["']/g);
  for (const m of extendMatches) {
    controls.add(m[1]);
    const controlName = m[1].split('.').pop();
    if (controlName) controls.add(controlName);
  }
  
  // Extract control names from metadata
  const metadataMatch = content.match(/metadata\s*:\s*\{[\s\S]*?library\s*:\s*["']([^"']+)["'][\s\S]*?\}/);
  if (metadataMatch) {
    controls.add(metadataMatch[1]);
  }
  
  return Array.from(controls);
}

// Utility: Calculate similarity score between strings
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  // Exact match
  if (s1 === s2) return 100;
  
  // One contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 90;
  
  // Levenshtein distance for fuzzy matching
  const matrix = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
  
  for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= s2.length; j++) {
    for (let i = 1; i <= s1.length; i++) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  const distance = matrix[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  return Math.max(0, (maxLength - distance) / maxLength * 100);
}

// Utility: Enhanced control matching with fuzzy matching
function isControlMatch(controlName: string, query: string): boolean {
  const name = controlName.toLowerCase();
  const q = query.toLowerCase();
  
  // Exact match
  if (name === q) return true;
  
  // Direct contains
  if (name.includes(q)) return true;
  
  // Check if query matches the control class name
  const controlParts = name.split('.');
  const lastPart = controlParts[controlParts.length - 1];
  if (lastPart && (lastPart === q || lastPart.includes(q))) return true;
  
  // Check for fuzzy similarity (threshold: 70%)
  if (calculateSimilarity(name, q) > 70) return true;
  if (lastPart && calculateSimilarity(lastPart, q) > 70) return true;
  
  // Check for common UI5 control patterns with synonyms
  const controlKeywords = [
    'wizard', 'button', 'table', 'input', 'list', 'panel', 'dialog', 'form',
    'navigation', 'layout', 'chart', 'page', 'app', 'shell', 'toolbar', 'menu',
    'container', 'text', 'label', 'image', 'card', 'tile', 'icon', 'bar',
    'picker', 'select', 'switch', 'slider', 'progress', 'busy', 'message',
    'notification', 'popover', 'tooltip', 'breadcrumb', 'rating', 'feed',
    'upload', 'calendar', 'date', 'time', 'color', 'file', 'search'
  ];
  
  // Check if query is a control keyword and the control name contains it
  if (controlKeywords.includes(q)) {
    return controlKeywords.some(kw => name.includes(kw));
  }
  
  return false;
}

// Determine the primary context of a query for smart filtering
function determineQueryContext(originalQuery: string, expandedQueries: string[]): string {
  const q = originalQuery.toLowerCase();
  const allQueries = [originalQuery, ...expandedQueries].map(s => s.toLowerCase());
  
  // CAP context indicators
  const capIndicators = ['cds', 'cap', 'entity', 'service', 'aspect', 'annotation', 'odata', 'hana'];
  const capScore = capIndicators.filter(term => 
    allQueries.some(query => query.includes(term))
  ).length;
  
  // wdi5 context indicators  
  const wdi5Indicators = ['wdi5', 'test', 'testing', 'e2e', 'browser', 'webdriver', 'selenium', 'automation', 'wdio', 'pageobject', 'selector', 'locator', 'assertion', 'fe-testlib'];
  const wdi5Score = wdi5Indicators.filter(term => 
    allQueries.some(query => query.includes(term))
  ).length;
  
  // UI5 context indicators
  const ui5Indicators = ['sap.m', 'sap.ui', 'sap.f', 'control', 'wizard', 'button', 'table', 'fiori', 'ui5'];
  const ui5Score = ui5Indicators.filter(term => 
    allQueries.some(query => query.includes(term))
  ).length;
  
  // Return strongest context
  if (capScore > 0 && capScore >= wdi5Score && capScore >= ui5Score) return 'CAP';
  if (wdi5Score > 0 && wdi5Score >= capScore && wdi5Score >= ui5Score) return 'wdi5';
  if (ui5Score > 0) return 'UI5';
  
  return 'MIXED'; // No clear context
}

// Apply context-aware penalties/boosts
function applyContextPenalties(score: number, libraryId: string, queryContext: string, query: string): number {
  const q = query.toLowerCase();
  
  // Strong penalties for off-context matches
  if (queryContext === 'CAP') {
    if (libraryId === '/openui5-api' || libraryId === '/openui5-samples') {
      // Penalize UI5 results for CAP queries unless they're integration-related
      if (!q.includes('ui5') && !q.includes('fiori') && !q.includes('integration')) {
        score *= 0.3; // 70% penalty
      }
    }
    if (libraryId === '/wdi5') {
      score *= 0.5; // 50% penalty for wdi5 on CAP queries
    }
  } else if (queryContext === 'wdi5') {
    if (libraryId === '/openui5-api' || libraryId === '/openui5-samples') {
      // Heavily penalize UI5 API for wdi5 queries unless testing-related
      if (!q.includes('testing') && !q.includes('test') && !q.includes('ui5')) {
        score *= 0.2; // 80% penalty
      }
    }
    if (libraryId === '/cap') {
      score *= 0.4; // 60% penalty for CAP on wdi5 queries
    }
  } else if (queryContext === 'UI5') {
    if (libraryId === '/cap') {
      // Penalize CAP for pure UI5 queries unless integration-related
      if (!q.includes('service') && !q.includes('odata') && !q.includes('backend')) {
        score *= 0.4; // 60% penalty
      }
    }
    if (libraryId === '/wdi5') {
      // Penalize wdi5 for UI5 queries unless testing-related
      if (!q.includes('test') && !q.includes('testing')) {
        score *= 0.3; // 70% penalty
      }
    }
  }
  
  return score;
}

export async function searchLibraries(query: string, fileContent?: string): Promise<SearchResponse> {
  const index = await loadIndex();
  let queries = expandQuery(query);
  
  // Generic query prioritization: ensure original user query is always first and most important
  const originalQuery = query.trim();
  const lowercaseQuery = originalQuery.toLowerCase();
  
  // Remove duplicates and ensure original query variants come first
  queries = [
    originalQuery,                    // User's exact query (highest priority)
    lowercaseQuery,                   // Lowercase version
    ...queries.filter(q => q !== originalQuery && q !== lowercaseQuery)
  ];

  // If file content is provided, extract controls/properties and add to queries
  if (fileContent) {
    const extracted = extractControlsFromContent(fileContent);
    queries = [...new Set([...queries, ...extracted])];
  }

  let allMatches: Array<any> = [];
  let triedQueries: string[] = [];

  // Determine query context for smart filtering
  const queryContext = determineQueryContext(query, queries);
  
  // HYBRID FTS APPROACH: Use FTS for fast candidate filtering, then apply sophisticated scoring
  let candidateDocIds = new Set<string>();
  let usedFTS = false;
  
  try {
    // Get FTS candidates with smart prioritization
    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      // Higher limit for original/important queries, lower for supplementary
      const limit = i < 3 ? 150 : 50; // First 3 queries get more candidates
      
      const ftsResults = getFTSCandidateIds(q, {}, limit);
      
      if (ftsResults.length > 0) {
        // For original query (first), add all candidates
        // For others, prioritize candidates that aren't already included
        if (i === 0) {
          // Original query gets full priority
          ftsResults.forEach(id => candidateDocIds.add(id));
        } else {
          // Add new candidates, but don't overwhelm
          let added = 0;
          for (const id of ftsResults) {
            if (!candidateDocIds.has(id) && added < 30) {
              candidateDocIds.add(id);
              added++;
            }
          }
        }
        usedFTS = true;
      }
    }
    
    // If FTS found no candidates or failed, fall back to searching everything
    if (candidateDocIds.size === 0) {
      console.log("FTS found no candidates, falling back to full search");
      usedFTS = false;
    }
  } catch (error) {
    console.warn("FTS search failed, falling back to full search:", error);
    usedFTS = false;
  }
  
  // Score matches more comprehensively with context awareness
  for (const q of queries) {
    triedQueries.push(q);
    
    // Search across all documents in all libraries (filtered by FTS candidates if available)
    for (const lib of Object.values(index)) {
      // Check if library name/description matches
      const libNameSimilarity = calculateSimilarity(lib.name, q);
      const libDescSimilarity = calculateSimilarity(lib.description, q);
      
      if (libNameSimilarity > 60 || libDescSimilarity > 40) {
        allMatches.push({
          score: Math.max(libNameSimilarity, libDescSimilarity),
          libraryId: lib.id,
          libraryName: lib.name,
          docId: lib.id,
          docTitle: `${lib.name} (Full Library)`,
          docDescription: lib.description,
          matchType: libNameSimilarity > libDescSimilarity ? 'Library Name' : 'Library Description',
          snippetCount: lib.docs.reduce((s, d) => s + d.snippetCount, 0),
          source: 'docs'
        });
      }
      
      // Search within individual documents with enhanced scoring
      for (const doc of lib.docs) {
        // If we're using FTS filtering, only process documents that are in the candidate set
        if (usedFTS && !candidateDocIds.has(doc.id)) {
          continue;
        }
        let score = 0;
        let matchType = '';
        
        // Calculate similarity scores for different aspects
        const titleSimilarity = calculateSimilarity(doc.title, q);
        const descSimilarity = calculateSimilarity(doc.description, q);
        
        // Check enhanced metadata fields if available (new index format)
        const docAny = doc as any;
        const controlName = docAny.controlName;
        const keywords = docAny.keywords || [];
        const properties = docAny.properties || [];
        const events = docAny.events || [];
        
        let keywordMatch = false;
        let controlNameMatch = false;
        let propertyMatch = false;
        
        // Check keyword matches
        if (keywords.length > 0) {
          keywordMatch = keywords.some((kw: string) => 
            kw.toLowerCase() === q.toLowerCase() || 
            kw.toLowerCase().includes(q.toLowerCase()) ||
            calculateSimilarity(kw.toLowerCase(), q.toLowerCase()) > 80
          );
        }
        
        // Check control name matches
        if (controlName) {
          controlNameMatch = controlName.toLowerCase() === q.toLowerCase() ||
                           controlName.toLowerCase().includes(q.toLowerCase()) ||
                           calculateSimilarity(controlName.toLowerCase(), q.toLowerCase()) > 80;
        }
        
        // Check property/event matches  
        if (properties.length > 0 || events.length > 0) {
          const allProps = [...properties, ...events];
          propertyMatch = allProps.some((prop: string) => 
            prop.toLowerCase() === q.toLowerCase() ||
            calculateSimilarity(prop.toLowerCase(), q.toLowerCase()) > 75
          );
        }
        
        // Enhanced generic scoring for better relevance detection
        
        // 1. Check for multi-word query matches in title
        const queryWords = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const titleWords = doc.title.toLowerCase().split(/\s+/);
        const wordMatchCount = queryWords.filter(qw => 
          titleWords.some(tw => tw.includes(qw) || qw.includes(tw))
        ).length;
        const wordMatchRatio = queryWords.length > 0 ? wordMatchCount / queryWords.length : 0;
        
        // 2. Check for phrase containment (e.g., "temporal entities" in "Declaring Temporal Entities")
        const titleContainsQuery = doc.title.toLowerCase().includes(q.toLowerCase());
        const queryContainsTitle = q.toLowerCase().includes(doc.title.toLowerCase());
        
        // 3. Exact matches get highest priority with heading level scoring
        if (doc.title.toLowerCase() === q.toLowerCase()) {
          // Base score for exact match
          score = 150;
          
          // Adjust score based on heading level for sections
          if ((doc as any).headingLevel) {
            const headingLevel = (doc as any).headingLevel;
            if (headingLevel === 2) {
              score = 160; // ## sections get highest score
            } else if (headingLevel === 3) {
              score = 155; // ### sections get medium score  
            } else if (headingLevel === 4) {
              score = 152; // #### sections get lower score
            }
            matchType = `Exact Title Match (H${headingLevel})`;
          } else {
            // Main document title (# level) gets the highest score
            score = 165;
            matchType = 'Exact Title Match (Main)';
          }
        }
        // 4. High word match ratio (most query words found in title)
        else if (wordMatchRatio >= 0.6 && wordMatchCount >= 2) {
          score = 140 + (wordMatchRatio * 20); // 140-160 range
          matchType = `High Word Match (${Math.round(wordMatchRatio * 100)}%)`;
        }
        // 5. Title contains full query phrase
        else if (titleContainsQuery && q.length > 5) {
          score = 135;
          matchType = 'Title Contains Query';
        }
        // 6. Query contains title (searching for specific within general)
        else if (queryContainsTitle && doc.title.length > 5) {
          score = 130;
          matchType = 'Query Contains Title';
        }
        // 7. Fall back to existing logic for other cases
        else if (controlNameMatch && controlName?.toLowerCase() === q.toLowerCase()) {
          score = 98;
          matchType = 'Exact Control Name Match';
        } else if (keywordMatch && keywords.some((kw: string) => kw.toLowerCase() === q.toLowerCase())) {
          score = 96;
          matchType = 'Exact Keyword Match';
        } else if (titleSimilarity > 80) {
          score = 95;
          matchType = 'High Title Similarity';
        } else if (controlNameMatch) {
          score = 92;
          matchType = 'Control Name Match';
        } else if (doc.title.toLowerCase().includes(q.toLowerCase())) {
          score = 90;
          matchType = 'Title Contains Query';
        } else if (keywordMatch) {
          score = 87;
          matchType = 'Keyword Match';
        } else if (descSimilarity > 70) {
          score = 85;
          matchType = 'High Description Similarity';
        } else if (propertyMatch) {
          score = 82;
          matchType = 'Property/Event Match';
        } else if (lib.id === '/openui5-api' && isControlMatch(doc.title, q)) {
          score = 80;
          matchType = 'UI5 Control Pattern Match';
        } else if (doc.description.toLowerCase().includes(q.toLowerCase())) {
          score = 75;
          matchType = 'Description Contains Query';
        } else if (titleSimilarity > 60) {
          score = 70;
          matchType = 'Moderate Title Similarity';
        } else if (descSimilarity > 50) {
          score = 65;
          matchType = 'Moderate Description Similarity';
        } else if (doc.title.toLowerCase().split(/[.\s_-]/).some(part => calculateSimilarity(part, q) > 70)) {
          score = 60;
          matchType = 'Partial Title Match';
        }
        
        // Context-aware scoring boosts
        if (score > 0) {
          // UI5-specific boosts
          if (lib.id === '/openui5-api') {
            score += 5; // Base boost for API docs
            // Extra boost for UI5 control terms
            const ui5Terms = ['control', 'sap.m', 'sap.ui', 'sap.f', 'wizard', 'button', 'table'];
            if (ui5Terms.some(term => q.includes(term))) score += 8;
          }
          
          if (lib.id === '/openui5-samples') {
            // Boost samples for implementation queries
            if (q.includes('sample') || q.includes('example') || q.includes('demo')) score += 10;
            // Boost for UI5 control samples
            if (controlName && q.includes(controlName.toLowerCase())) score += 12;
          }
          
          if (lib.id === '/sapui5') {
            // Boost SAPUI5 docs for UI5-specific queries
            const ui5Queries = ['fiori', 'ui5', 'sapui5', 'control', 'binding', 'routing'];
            if (ui5Queries.some(term => q.includes(term))) score += 8;
            // Boost for conceptual queries
            if (q.includes('guide') || q.includes('tutorial') || q.includes('how')) score += 6;
          }
          
          // CAP-specific boosts
          if (lib.id === '/cap') {
            const capTerms = ['cds', 'cap', 'service', 'entity', 'annotation', 'aspect', 'odata', 'hana', 'temporal'];
            if (capTerms.some(term => q.includes(term))) score += 10;
            // Extra boost for CAP core concepts
            const coreCapTerms = ['cds', 'entity', 'service', 'aspect', 'temporal'];
            if (coreCapTerms.some(term => q.includes(term))) score += 5;
            // Boost for development guides
            if (q.includes('guide') || q.includes('tutorial') || q.includes('how')) score += 8;
          }
          
          // wdi5-specific boosts
          if (lib.id === '/wdi5') {
            const wdi5Terms = ['wdi5', 'test', 'testing', 'e2e', 'browser', 'selector', 'webdriver', 'wdio', 'pageobject', 'fe-testlib'];
            if (wdi5Terms.some(term => q.includes(term))) score += 15;
            // Extra boost for testing concepts
            const testingTerms = ['test', 'testing', 'assertion', 'automation', 'locator', 'matcher'];
            if (testingTerms.some(term => q.includes(term))) score += 10;
            // Boost for UI5 testing specific terms
            const ui5TestingTerms = ['sap.ui.test', 'ui5 test', 'control selector', 'byId', 'byProperty'];
            if (ui5TestingTerms.some(term => q.includes(term))) score += 12;
          }
          
          // Apply context-aware penalties to reduce off-topic results
          score = applyContextPenalties(score, lib.id, queryContext, q);
          
          allMatches.push({
            score: Math.min(200, Math.max(0, score)), // Cap at 200 to allow exact matches, floor at 0
            libraryId: lib.id,
            libraryName: lib.name,
            docId: doc.id,
            docTitle: doc.title,
            docDescription: doc.description,
            matchType,
            snippetCount: doc.snippetCount,
            source: 'docs',
            titleSimilarity,
            descSimilarity
          });
        }
      }
    }
  }

  // If still no results, try comprehensive fuzzy search
  if (allMatches.length === 0) {
    const originalQuery = query.toLowerCase();
    const queryParts = originalQuery.split(/[\s_-]+/).filter(part => part.length > 2);
    
    for (const lib of Object.values(index)) {
      for (const doc of lib.docs) {
        // If we're using FTS filtering, only process documents that are in the candidate set
        if (usedFTS && !candidateDocIds.has(doc.id)) {
          continue;
        }
        let maxScore = 0;
        let bestMatchType = 'Fuzzy Search';
        
        // Try fuzzy matching against title parts
        const titleParts = doc.title.toLowerCase().split(/[\s._-]+/);
        for (const titlePart of titleParts) {
          for (const queryPart of queryParts) {
            const similarity = calculateSimilarity(titlePart, queryPart);
            if (similarity > maxScore && similarity > 50) {
              maxScore = similarity * 0.8; // Reduce score for fuzzy matches
              bestMatchType = 'Fuzzy Title Match';
            }
          }
        }
        
        // Try fuzzy matching against description parts
        const descParts = doc.description.toLowerCase().split(/[\s._-]+/);
        for (const descPart of descParts) {
          if (descPart.length > 3) { // Only check meaningful words
            for (const queryPart of queryParts) {
              const similarity = calculateSimilarity(descPart, queryPart);
              if (similarity > maxScore && similarity > 50) {
                maxScore = similarity * 0.6; // Further reduce for description matches
                bestMatchType = 'Fuzzy Description Match';
              }
            }
          }
        }
        
        if (maxScore > 30) { // Lower threshold for fuzzy results
          allMatches.push({
            score: maxScore,
            libraryId: lib.id,
            libraryName: lib.name,
            docId: doc.id,
            docTitle: doc.title,
            docDescription: doc.description,
            matchType: bestMatchType,
            snippetCount: doc.snippetCount,
            source: 'docs'
          });
        }
      }
    }
  }

  // Sort all results by relevance score (highest first), then by title
  function sortByScore(a: any, b: any) {
    if (b.score !== a.score) return b.score - a.score;
    return a.docTitle.localeCompare(b.docTitle);
  }
  allMatches.sort(sortByScore);

  // Take top results regardless of library, but ensure diversity
  const topResults = [];
  const seenLibraries = new Set();
  const maxPerLibrary = queryContext === 'MIXED' ? 3 : 5; // More diversity for mixed queries
  
  for (const result of allMatches) {
    if (topResults.length >= 10) break; // Limit total results
    
    const libraryCount = topResults.filter(r => r.libraryId === result.libraryId).length;
    if (libraryCount < maxPerLibrary) {
      topResults.push(result);
      seenLibraries.add(result.libraryId);
    }
  }
  
  // Group results by library for presentation (but maintain score order)
  const apiDocs = topResults.filter(r => r.libraryId === '/openui5-api');
  const samples = topResults.filter(r => r.libraryId === '/openui5-samples');
  const guides = topResults.filter(r => r.libraryId === '/sapui5' || r.libraryId === '/cap' || r.libraryId === '/wdi5');

  if (!topResults.length) {
    // User feedback loop: suggest alternatives
    let suggestion = "No documentation found for '" + query + "'. ";
    if (fileContent) {
      suggestion += "Try searching for: " + extractControlsFromContent(fileContent).join(", ") + ". ";
    }
    suggestion += "Try terms like 'button', 'table', 'wizard', 'routing', 'annotation', or check for typos.";
    return { results: [], error: suggestion };
  }

  // Group results for presentation with context awareness
  const contextEmoji: Record<string, string> = {
    'CAP': '🏗️',
    'wdi5': '🧪', 
    'UI5': '🎨',
    'MIXED': '🔀'
  };
  
  // Add FTS info to response for transparency
  const ftsInfo = usedFTS ? ` (🚀 FTS-filtered from ${candidateDocIds.size} candidates)` : ' (🔍 Full search)';
  let response = `Found ${topResults.length} results for '${query}' ${contextEmoji[queryContext] || '🔍'} **${queryContext} Context**${ftsInfo}:\n\n`;
  
  // Show results in score order, grouped by type
  if (guides.length > 0) {
    const capGuides = guides.filter(r => r.libraryId === '/cap');
    const wdi5Guides = guides.filter(r => r.libraryId === '/wdi5');
    const sapui5Guides = guides.filter(r => r.libraryId === '/sapui5');
    
    if (capGuides.length > 0) {
      response += `🏗️ **CAP Documentation:**\n`;
      for (const r of capGuides) {
        response += `⭐️ **${r.docTitle}** (Score: ${r.score.toFixed(0)}) - \`${r.docId}\`\n   ${r.docDescription.substring(0, 120)}\n   Use in sap_docs_get\n\n`;
      }
    }
    
    if (wdi5Guides.length > 0) {
      response += `🧪 **wdi5 Documentation:**\n`;
      for (const r of wdi5Guides) {
        response += `⭐️ **${r.docTitle}** (Score: ${r.score.toFixed(0)}) - \`${r.docId}\`\n   ${r.docDescription.substring(0, 120)}\n   Use in sap_docs_get\n\n`;
      }
    }
    
    if (sapui5Guides.length > 0) {
      response += `📖 **SAPUI5 Guides:**\n`;
      for (const r of sapui5Guides) {
        response += `⭐️ **${r.docTitle}** (Score: ${r.score.toFixed(0)}) - \`${r.docId}\`\n   ${r.docDescription.substring(0, 120)}\n   Use in sap_docs_get\n\n`;
      }
    }
  }
  
  if (apiDocs.length > 0) {
    response += `🔹 **UI5 API Documentation:**\n`;
    for (const r of apiDocs.slice(0, 3)) {
      response += `⭐️ **${r.docTitle}** (Score: ${r.score.toFixed(0)}) - \`${r.docId}\`\n   ${r.docDescription.substring(0, 120)}\n   Use in sap_docs_get\n\n`;
    }
  }
  
  if (samples.length > 0) {
    response += `🔸 **UI5 Samples:**\n`;
    for (const r of samples.slice(0, 3)) {
      response += `⭐️ **${r.docTitle}** (Score: ${r.score.toFixed(0)}) - \`${r.docId}\`\n   ${r.docDescription.substring(0, 120)}\n   Use in sap_docs_get\n\n`;
    }
  }
  
  response += `💡 **Context**: ${queryContext} query detected. Scores reflect relevance to this context.\n`;
  response += `🔍 **Tried queries**: ${triedQueries.slice(0, 3).join(", ")}${triedQueries.length > 3 ? '...' : ''}`;

  return {
    results: [{
      id: 'search-results',
      title: `Search Results for '${query}'`,
      description: response,
      totalSnippets: topResults.reduce((sum, r) => sum + r.snippetCount, 0)
    }]
  };
}



export async function fetchLibraryDocumentation(
  libraryIdOrDocId: string,
  topic = ""
): Promise<string | null> {
  // Check if this is a community post ID
  if (libraryIdOrDocId.startsWith('community-')) {
    return await getCommunityPost(libraryIdOrDocId);
  }

  const index = await loadIndex();
  
  // Check if this is a specific document ID
  const allDocs: Array<{lib: any, doc: any}> = [];
  for (const lib of Object.values(index)) {
    for (const doc of lib.docs) {
      allDocs.push({ lib, doc });
      // If this matches a specific document ID, return just that document
      if (doc.id === libraryIdOrDocId) {
        let sourcePath: string;
        
        if (lib.id === "/sapui5") {
          sourcePath = "sapui5-docs/docs";
        } else if (lib.id === "/cap") {
          sourcePath = "cap-docs";
        } else if (lib.id === "/openui5-api") {
          sourcePath = "openui5/src";
        } else if (lib.id === "/openui5-samples") {
          sourcePath = "openui5/src";
        } else if (lib.id === "/wdi5") {
          sourcePath = "wdi5/docs";
        } else {
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
        // For documented libraries, add URL context
        else if (DOC_URL_CONFIGS[lib.id]) {
          const documentationUrl = generateDocumentationUrl(lib.id, doc.relFile, content);
          const libName = lib.id.replace('/', '').toUpperCase();
          
          return `**Source:** ${libName} Documentation
**URL:** ${documentationUrl || 'Documentation URL not available'}
**File:** ${doc.relFile}

---

${content}

---

*This content is from the ${libName} documentation. Visit the URL above for the latest version and interactive examples.*`;
        } else {
          return content;
        }
      }
    }
  }
  
  // If not a specific document ID, treat as library ID
  const lib = index[libraryIdOrDocId];
  if (!lib) return null;

  const term = topic.toLowerCase();
  const targets = term
    ? lib.docs.filter(
        (d) =>
          d.title.toLowerCase().includes(term) ||
          d.description.toLowerCase().includes(term)
      )
    : lib.docs;

  if (!targets.length) return `No topic "${topic}" found inside ${libraryIdOrDocId}.`;

  const parts: string[] = [];
  for (const doc of targets) {
    let sourcePath: string;
    
    if (lib.id === "/sapui5") {
      sourcePath = "sapui5-docs/docs";
    } else if (lib.id === "/cap") {
      sourcePath = "cap-docs";
    } else if (lib.id === "/openui5-api") {
      sourcePath = "openui5/src";
    } else if (lib.id === "/openui5-samples") {
      sourcePath = "openui5/src";
    } else if (lib.id === "/wdi5") {
      sourcePath = "wdi5/docs";
    } else {
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
    // For documented libraries, add URL context
    else if (DOC_URL_CONFIGS[lib.id]) {
      const documentationUrl = generateDocumentationUrl(lib.id, doc.relFile, content);
      const libName = lib.id.replace('/', '').toUpperCase();
      
      const formattedContent = `**Source:** ${libName} Documentation
**URL:** ${documentationUrl || 'Documentation URL not available'}
**File:** ${doc.relFile}

---

${content}

---

*This content is from the ${libName} documentation. Visit the URL above for the latest version and interactive examples.*`;
      parts.push(formattedContent);
    } else {
      parts.push(content);
    }
  }
  return parts.join("\n\n---\n\n");
}

// Resource support for MCP
export async function listDocumentationResources() {
  const index = await loadIndex();
  const resources: Array<{
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }> = [];

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

export async function readDocumentationResource(uri: string) {
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
      ...lib.docs.map(doc => 
        `- **${doc.title}**: ${doc.description} (${doc.snippetCount} code snippets)`
      ),
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

  let sourcePath: string;
  
      if (libraryId === "/sapui5") {
      sourcePath = "sapui5-docs/docs";
    } else if (libraryId === "/cap") {
      sourcePath = "cap-docs";
    } else if (libraryId === "/openui5-api") {
      sourcePath = "openui5/src";
    } else if (libraryId === "/openui5-samples") {
      sourcePath = "openui5/src";
    } else if (libraryId === "/wdi5") {
      sourcePath = "wdi5/docs";
    } else {
      throw new Error(`Unknown library ID: ${libraryId}`);
    }
  
  const absPath = path.join(PROJECT_ROOT, "sources", sourcePath, doc.relFile);

  try {
    const content = await fs.readFile(absPath, "utf8");
    
    // Format files for better readability
    let formattedContent = content;
    if (doc.relFile && doc.relFile.endsWith('.js') && libraryId === '/openui5-api') {
      formattedContent = formatJSDocContent(content, doc.title || '');
    } else if (libraryId === '/openui5-samples') {
      formattedContent = formatSampleContent(content, doc.relFile, doc.title || '');
    } else if (DOC_URL_CONFIGS[libraryId]) {
      const documentationUrl = generateDocumentationUrl(libraryId, doc.relFile, content);
      const libName = libraryId.replace('/', '').toUpperCase();
      
      formattedContent = `**Source:** ${libName} Documentation
**URL:** ${documentationUrl || 'Documentation URL not available'}
**File:** ${doc.relFile}

---

${content}

---

*This content is from the ${libName} documentation. Visit the URL above for the latest version and interactive examples.*`;
    }
    
    return {
      contents: [{
        uri,
        mimeType: "text/markdown",
        text: formattedContent
      }]
    };
  } catch (error) {
    throw new Error(`Failed to read document: ${error}`);
  }
}

// Export the community search function for use as a separate tool
export async function searchCommunity(query: string): Promise<SearchResponse> {
  try {
    // Use the convenience function to search and get top 3 posts with full content
    const result = await searchAndGetTopPosts(query, 3, {
      includeBlogs: true,
      userAgent: 'SAP-Docs-MCP/1.0'
    });
    
    if (result.search.length === 0) {
      return { 
        results: [], 
        error: `No SAP Community posts found for "${query}". Try different keywords or check your connection.` 
      };
    }

    // Format the results with full post content
    let response = `Found ${result.search.length} SAP Community posts for "${query}" with full content:\n\n`;
    response += `🌐 **SAP Community Posts with Full Content:**\n\n`;

    for (const searchResult of result.search) {
      const postContent = result.posts[searchResult.postId || ''];
      
      if (postContent) {
        // Add the full post content
        response += postContent + '\n\n';
        response += `---\n\n`;
      } else {
        // Fallback to search result info if full content not available
        const postDate = searchResult.published || 'Unknown';
        response += `### **${searchResult.title}**\n`;
        response += `**Posted:** ${postDate}\n`;
        response += `**Description:** ${searchResult.snippet || 'No description available'}\n`;
        response += `**URL:** ${searchResult.url}\n`;
        response += `**ID:** \`community-${searchResult.postId}\`\n\n`;
        response += `---\n\n`;
      }
    }

    response += `💡 **Note:** These results include the full content from ${Object.keys(result.posts).length} SAP Community posts, representing real-world developer experiences and solutions.`;

    return { 
      results: [{
        id: 'community-search-results-with-content',
        title: `SAP Community Results with Full Content for "${query}"`,
        description: response,
        totalSnippets: result.search.length,
        source: 'community'
      }]
    };
  } catch (error: any) {
    console.error("Error searching SAP Community:", error);
    return { 
      results: [], 
      error: `Error searching SAP Community: ${error?.message || 'Unknown error'}. Please try again later.` 
    };
  }
} 