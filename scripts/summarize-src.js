#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SRC_DIR = path.join(__dirname, '..', 'src');
const TEST_DIR = path.join(__dirname, '..', 'test');
const SRC_OUTPUT_FILE = path.join(__dirname, '..', 'src_context.txt');
const TEST_OUTPUT_FILE = path.join(__dirname, '..', 'test_context.txt');

// Content inclusion settings
const INCLUDE_CONTENT = true;
const MAX_CONTENT_SIZE = 50000; // Max characters per file to include
const CONTENT_PREVIEW_SIZE = 500; // Characters for preview when file is too large

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

// Function to extract exports from TypeScript/JavaScript files
async function extractExports(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const exports = [];
    
    // Named exports: export { name1, name2 }
    const namedExportRegex = /export\s*\{\s*([^}]+)\s*\}/g;
    let match;
    while ((match = namedExportRegex.exec(content)) !== null) {
      const names = match[1].split(',').map(n => n.trim().split(' as ')[0].trim());
      exports.push(...names);
    }
    
    // Function/class exports: export function name() {} or export class Name {}
    const functionClassRegex = /export\s+(?:async\s+)?(?:function|class)\s+(\w+)/g;
    while ((match = functionClassRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }
    
    // Variable exports: export const name = ...
    const variableRegex = /export\s+(?:const|let|var)\s+(\w+)/g;
    while ((match = variableRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }
    
    // Default export
    if (content.includes('export default')) {
      exports.push('default');
    }
    
    return [...new Set(exports)]; // Remove duplicates
  } catch (error) {
    return [];
  }
}

// Function to read file content with size limit
async function getFileContent(filePath, maxSize = MAX_CONTENT_SIZE) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    if (content.length <= maxSize) {
      return {
        content,
        truncated: false,
        originalSize: content.length
      };
    } else {
      return {
        content: content.substring(0, CONTENT_PREVIEW_SIZE) + '\n\n... [Content truncated - file too large] ...\n\n' + content.substring(content.length - CONTENT_PREVIEW_SIZE),
        truncated: true,
        originalSize: content.length
      };
    }
  } catch (error) {
    return {
      content: `[Error reading file: ${error.message}]`,
      truncated: false,
      originalSize: 0
    };
  }
}

// Function to extract metadata from file content
function extractMetadata(content, fileType, filePath) {
  const metadata = {
    functions: [],
    classes: [],
    interfaces: [],
    types: [],
    constants: [],
    comments: []
  };
  
  if (fileType === 'typescript' || fileType === 'javascript') {
    // Extract functions
    const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      metadata.functions.push(match[1]);
    }
    
    // Extract arrow functions
    const arrowFunctionRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
    while ((match = arrowFunctionRegex.exec(content)) !== null) {
      metadata.functions.push(match[1]);
    }
    
    // Extract classes
    const classRegex = /(?:export\s+)?class\s+(\w+)/g;
    while ((match = classRegex.exec(content)) !== null) {
      metadata.classes.push(match[1]);
    }
    
    // Extract interfaces (TypeScript)
    if (fileType === 'typescript') {
      const interfaceRegex = /(?:export\s+)?interface\s+(\w+)/g;
      while ((match = interfaceRegex.exec(content)) !== null) {
        metadata.interfaces.push(match[1]);
      }
      
      // Extract type aliases
      const typeRegex = /(?:export\s+)?type\s+(\w+)/g;
      while ((match = typeRegex.exec(content)) !== null) {
        metadata.types.push(match[1]);
      }
    }
    
    // Extract constants
    const constRegex = /(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=/g;
    while ((match = constRegex.exec(content)) !== null) {
      metadata.constants.push(match[1]);
    }
    
    // Extract JSDoc comments
    const jsdocRegex = /\/\*\*[\s\S]*?\*\//g;
    const jsdocMatches = content.match(jsdocRegex);
    if (jsdocMatches) {
      metadata.comments = jsdocMatches.slice(0, 3); // First 3 JSDoc comments
    }
  }
  
  return metadata;
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
      const exports = fileType === 'typescript' || fileType === 'javascript'
        ? await extractExports(fullPath)
        : [];
      
      // Get file content if enabled
      const fileContent = INCLUDE_CONTENT ? await getFileContent(fullPath) : null;
      const metadata = fileContent ? extractMetadata(fileContent.content, fileType, fullPath) : null;

      const fileInfo = {
        name: item,
        path: itemRelativePath,
        type: fileType,
        size: stats.size,
        lines,
        created: stats.created,
        modified: stats.modified,
        imports,
        exports,
        content: fileContent,
        metadata
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

// Main function to analyze a specific directory
async function generateSummaryForDirectory(dirPath, outputFile, dirName) {
  console.log(`🔍 Analyzing ${dirName} folder...`);
  
  try {
    // Check if directory exists
    const dirExists = await fs.access(dirPath).then(() => true).catch(() => false);
    if (!dirExists) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    // Analyze the entire directory
    const analysis = await analyzeDirectory(dirPath);
    
    // Sort files by size and modification date
    analysis.largestFiles = analysis.files
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);
    
    analysis.recentFiles = analysis.files
      .sort((a, b) => b.modified - a.modified)
      .slice(0, 10);

    // Generate summary content
    const summary = generateSummaryContent(analysis, dirName);
    
    // Write to file
    await fs.writeFile(outputFile, summary, 'utf-8');
    
    console.log(`✅ Summary written to: ${outputFile}`);
    console.log(`📊 Total files: ${analysis.totalFiles}`);
    console.log(`📝 Total lines: ${analysis.totalLines.toLocaleString()}`);
    console.log(`📁 Directories: ${analysis.directories.length}`);
    
    return analysis;
    
  } catch (error) {
    console.error(`❌ Error generating ${dirName} summary:`, error.message);
    throw error;
  }
}

// Main function
async function generateSummary() {
  try {
    // Analyze src directory
    await generateSummaryForDirectory(SRC_DIR, SRC_OUTPUT_FILE, 'src');
    console.log('');
    
    // Analyze test directory
    await generateSummaryForDirectory(TEST_DIR, TEST_OUTPUT_FILE, 'test');
    
    console.log('\n🎉 Both summaries generated successfully!');
    
  } catch (error) {
    console.error('❌ Error generating summaries:', error.message);
    process.exit(1);
  }
}

// Function to generate summary content
function generateSummaryContent(analysis, dirName = 'src') {
  const now = new Date();
  const isTestDir = dirName === 'test';
  
  let content = `# ${isTestDir ? 'Test Code' : 'Source Code'} Analysis Summary
Generated: ${now.toISOString()}
Project: SAP Docs MCP
${isTestDir ? 'Test' : 'Source'} Directory: ${dirName}/

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
    let fileSection = `### 📄 ${file.path}
**Type:** ${file.type}
**Size:** ${formatFileSize(file.size)}
**Lines:** ${file.lines}
**Modified:** ${formatDate(file.modified)}`;

    if (file.imports.length > 0) {
      fileSection += `\n**Imports:** ${file.imports.join(', ')}`;
    }
    
    if (file.exports.length > 0) {
      fileSection += `\n**Exports:** ${file.exports.join(', ')}`;
    }
    
    if (file.metadata) {
      const meta = file.metadata;
      if (meta.functions.length > 0) {
        fileSection += `\n**Functions:** ${meta.functions.join(', ')}`;
      }
      if (meta.classes.length > 0) {
        fileSection += `\n**Classes:** ${meta.classes.join(', ')}`;
      }
      if (meta.interfaces.length > 0) {
        fileSection += `\n**Interfaces:** ${meta.interfaces.join(', ')}`;
      }
      if (meta.types.length > 0) {
        fileSection += `\n**Types:** ${meta.types.join(', ')}`;
      }
      if (meta.constants.length > 0) {
        fileSection += `\n**Constants:** ${meta.constants.join(', ')}`;
      }
    }
    
    if (file.content && INCLUDE_CONTENT) {
      fileSection += `\n\n**Content:**`;
      if (file.content.truncated) {
        fileSection += ` (${formatFileSize(file.content.originalSize)} - truncated)`;
      }
      fileSection += `\n\`\`\`${file.type === 'typescript' ? 'typescript' : file.type === 'javascript' ? 'javascript' : ''}\n${file.content.content}\n\`\`\``;
    }
    
    return fileSection;
  })
  .join('\n\n')}

## 🔗 Most Common Imports
${Array.from(analysis.imports)
  .sort()
  .slice(0, 20)
  .map(imp => `- ${imp}`)
  .join('\n')}

## 🔍 Code Analysis Summary
${(() => {
  const allFunctions = analysis.files.flatMap(f => f.metadata?.functions || []);
  const allClasses = analysis.files.flatMap(f => f.metadata?.classes || []);
  const allInterfaces = analysis.files.flatMap(f => f.metadata?.interfaces || []);
  const allTypes = analysis.files.flatMap(f => f.metadata?.types || []);
  const allExports = analysis.files.flatMap(f => f.exports || []);
  
  return `- Total Functions: ${allFunctions.length}
- Total Classes: ${allClasses.length}
- Total Interfaces: ${allInterfaces.length}
- Total Types: ${allTypes.length}
- Total Exports: ${allExports.length}
- Files with Content: ${analysis.files.filter(f => f.content).length}`;
})()}

## 📈 Statistics
- Average file size: ${formatFileSize(analysis.files.reduce((sum, f) => sum + f.size, 0) / analysis.totalFiles)}
- Average lines per file: ${Math.round(analysis.totalLines / analysis.totalFiles)}
- Most common file type: ${Object.entries(analysis.fileTypes).sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A'}
- Oldest file: ${analysis.files.length > 0 ? formatDate(analysis.files.reduce((oldest, f) => f.created < oldest.created ? f : oldest).created) : 'N/A'}
- Newest file: ${analysis.files.length > 0 ? formatDate(analysis.files.reduce((newest, f) => f.modified > newest.modified ? f : newest).modified) : 'N/A'}
- Content included: ${INCLUDE_CONTENT ? 'Yes' : 'No'}
- Max content size per file: ${formatFileSize(MAX_CONTENT_SIZE)}

---
Generated by summarize-src.js for ${dirName}/ directory
`;

  return content;
}

// Run the script
generateSummary();
