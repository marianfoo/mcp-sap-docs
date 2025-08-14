#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SRC_DIR = path.join(__dirname, '..', 'src');
const OUTPUT_FILE = path.join(__dirname, '..', 'src_context.txt');

// File type patterns
const FILE_PATTERNS = {
  typescript: /\.(ts|tsx)$/,
  javascript: /\.(js|jsx)$/,
  json: /\.json$/,
  markdown: /\.(md|mdx)$/,
  yaml: /\.(yml|yaml)$/,
  xml: /\.xml$/,
  html: /\.html$/,
  css: /\.css$/,
  scss: /\.scss$/,
  sql: /\.sql$/,
  config: /\.(config|conf)$/
};

// Function to get file stats
async function getFileStats(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isDirectory: stats.isDirectory()
    };
  } catch (error) {
    return null;
  }
}

// Function to get file type
function getFileType(filename) {
  for (const [type, pattern] of Object.entries(FILE_PATTERNS)) {
    if (pattern.test(filename)) {
      return type;
    }
  }
  return 'other';
}

// Function to count lines in a file
async function countLines(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.split('\n').length;
  } catch (error) {
    return 0;
  }
}

// Function to extract imports from TypeScript/JavaScript files
async function extractImports(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"`]([^'"`]+)['"`]/g;
    const imports = [];
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    return imports;
  } catch (error) {
    return [];
  }
}

// Function to analyze directory recursively
async function analyzeDirectory(dirPath, relativePath = '') {
  const items = await fs.readdir(dirPath);
  const analysis = {
    files: [],
    directories: [],
    totalFiles: 0,
    totalLines: 0,
    fileTypes: {},
    imports: new Set(),
    largestFiles: [],
    recentFiles: []
  };

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const itemRelativePath = path.join(relativePath, item);
    const stats = await getFileStats(fullPath);

    if (!stats) continue;

    if (stats.isDirectory) {
      analysis.directories.push({
        name: item,
        path: itemRelativePath,
        stats
      });
      
      // Recursively analyze subdirectory
      const subAnalysis = await analyzeDirectory(fullPath, itemRelativePath);
      analysis.files.push(...subAnalysis.files);
      analysis.totalFiles += subAnalysis.totalFiles;
      analysis.totalLines += subAnalysis.totalLines;
      analysis.imports = new Set([...analysis.imports, ...subAnalysis.imports]);
      
      // Merge file types
      for (const [type, count] of Object.entries(subAnalysis.fileTypes)) {
        analysis.fileTypes[type] = (analysis.fileTypes[type] || 0) + count;
      }
    } else {
      const fileType = getFileType(item);
      const lines = await countLines(fullPath);
      const imports = fileType === 'typescript' || fileType === 'javascript' 
        ? await extractImports(fullPath) 
        : [];

      const fileInfo = {
        name: item,
        path: itemRelativePath,
        type: fileType,
        size: stats.size,
        lines,
        created: stats.created,
        modified: stats.modified,
        imports
      };

      analysis.files.push(fileInfo);
      analysis.totalFiles++;
      analysis.totalLines += lines;
      analysis.fileTypes[fileType] = (analysis.fileTypes[fileType] || 0) + 1;
      
      // Add imports to global set
      imports.forEach(imp => analysis.imports.add(imp));
    }
  }

  return analysis;
}

// Function to format file size
function formatFileSize(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// Function to format date
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Main function
async function generateSummary() {
  console.log('🔍 Analyzing src folder...');
  
  try {
    // Check if src directory exists
    const srcExists = await fs.access(SRC_DIR).then(() => true).catch(() => false);
    if (!srcExists) {
      throw new Error(`Source directory not found: ${SRC_DIR}`);
    }

    // Analyze the entire src directory
    const analysis = await analyzeDirectory(SRC_DIR);
    
    // Sort files by size and modification date
    analysis.largestFiles = analysis.files
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);
    
    analysis.recentFiles = analysis.files
      .sort((a, b) => b.modified - a.modified)
      .slice(0, 10);

    // Generate summary content
    const summary = generateSummaryContent(analysis);
    
    // Write to file
    await fs.writeFile(OUTPUT_FILE, summary, 'utf-8');
    
    console.log(`✅ Summary written to: ${OUTPUT_FILE}`);
    console.log(`📊 Total files: ${analysis.totalFiles}`);
    console.log(`📝 Total lines: ${analysis.totalLines.toLocaleString()}`);
    console.log(`📁 Directories: ${analysis.directories.length}`);
    
  } catch (error) {
    console.error('❌ Error generating summary:', error.message);
    process.exit(1);
  }
}

// Function to generate summary content
function generateSummaryContent(analysis) {
  const now = new Date();
  
  let content = `# Source Code Analysis Summary
Generated: ${now.toISOString()}
Project: SAP Docs MCP
Source Directory: src/

## 📊 Overview
- Total Files: ${analysis.totalFiles.toLocaleString()}
- Total Lines of Code: ${analysis.totalLines.toLocaleString()}
- Directories: ${analysis.directories.length}
- Unique Imports: ${analysis.imports.size}

## 📁 Directory Structure
${analysis.directories.map(dir => `- ${dir.path}/`).join('\n')}

## 📄 File Types Distribution
${Object.entries(analysis.fileTypes)
  .sort(([,a], [,b]) => b - a)
  .map(([type, count]) => `- ${type}: ${count} files`)
  .join('\n')}

## 🔝 Largest Files (by size)
${analysis.largestFiles.map((file, index) => 
  `${index + 1}. ${file.path} (${formatFileSize(file.size)}, ${file.lines} lines)`
).join('\n')}

## ⏰ Recently Modified Files
${analysis.recentFiles.map((file, index) => 
  `${index + 1}. ${file.path} (${formatDate(file.modified)})`
).join('\n')}

## 📋 Detailed File Analysis
${analysis.files
  .sort((a, b) => a.path.localeCompare(b.path))
  .map(file => {
    const imports = file.imports.length > 0 ? `\n    Imports: ${file.imports.join(', ')}` : '';
    return `- ${file.path}
    Type: ${file.type}
    Size: ${formatFileSize(file.size)}
    Lines: ${file.lines}
    Modified: ${formatDate(file.modified)}${imports}`;
  })
  .join('\n\n')}

## 🔗 Most Common Imports
${Array.from(analysis.imports)
  .sort()
  .slice(0, 20)
  .map(imp => `- ${imp}`)
  .join('\n')}

## 📈 Statistics
- Average file size: ${formatFileSize(analysis.files.reduce((sum, f) => sum + f.size, 0) / analysis.totalFiles)}
- Average lines per file: ${Math.round(analysis.totalLines / analysis.totalFiles)}
- Most common file type: ${Object.entries(analysis.fileTypes).sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A'}
- Oldest file: ${analysis.files.length > 0 ? formatDate(analysis.files.reduce((oldest, f) => f.created < oldest.created ? f : oldest).created) : 'N/A'}
- Newest file: ${analysis.files.length > 0 ? formatDate(analysis.files.reduce((newest, f) => f.modified > newest.modified ? f : newest).modified) : 'N/A'}

---
Generated by summarize-src.js
`;

  return content;
}

// Run the script
generateSummary();
