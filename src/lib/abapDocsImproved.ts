/**
 * Improved ABAP Documentation Tools - Optimized for LLM consumption
 * 
 * This implementation prioritizes individual files for specific queries
 * and uses bundles only for broader conceptual searches.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findProjectRoot(startPath: string): string {
  let currentPath = startPath;
  while (currentPath !== path.dirname(currentPath)) {
    if (existsSync(path.join(currentPath, 'package.json'))) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }
  throw new Error('Could not find project root');
}

const PROJECT_ROOT = findProjectRoot(__dirname);
const ABAP_DOCS_PATH = path.join(PROJECT_ROOT, 'sources', 'abap-docs', 'docs');

export interface AbapIndividualFile {
  filename: string;
  title: string;
  content?: string;
  size: number;
  relevance?: string;
}

export interface ImprovedAbapSearchResult {
  id: string;
  title: string;
  version: string;
  type: 'individual' | 'focused-bundle' | 'quick-ref';
  file: string;
  score: number;
  preview: string;
  size: string;
}

/**
 * Search individual ABAP documentation files (optimal for LLM consumption)
 */
export async function searchIndividualAbapFiles(
  query: string,
  version: string = '7.58', 
  limit: number = 10
): Promise<ImprovedAbapSearchResult[]> {
  const mdPath = path.join(ABAP_DOCS_PATH, version, 'md');
  
  if (!existsSync(mdPath)) {
    throw new Error(`Individual files not found for version ${version}`);
  }
  
  const results: ImprovedAbapSearchResult[] = [];
  const searchTerms = query.toLowerCase().split(/\s+/);
  
  // Get all MD files
  const allFiles = await fs.readdir(mdPath);
  const mdFiles = allFiles.filter(f => f.endsWith('.md'));
  
  for (const filename of mdFiles) {
    const filePath = path.join(mdPath, filename);
    
    try {
      const stats = await fs.stat(filePath);
      const filenameLower = filename.toLowerCase();
      
      let score = 0;
      
      // Score based on filename relevance
      for (const term of searchTerms) {
        if (filenameLower.includes(term)) {
          score += 20; // High score for filename matches
        }
      }
      
      // Only read file if there's potential relevance (performance optimization)
      if (score > 0 || searchTerms.some(term => term.length > 3 && filenameLower.includes(term))) {
        const content = await fs.readFile(filePath, 'utf8');
        const contentLower = content.toLowerCase();
        
        // Additional scoring based on content
        for (const term of searchTerms) {
          const matches = (contentLower.match(new RegExp(term, 'gi')) || []).length;
          score += matches * 0.5; // Content matches worth less than filename
        }
        
        // Title scoring (from content)
        const lines = content.split('\n');
        const titleLine = lines.find(line => line.startsWith('#'));
        if (titleLine) {
          const titleLower = titleLine.toLowerCase();
          for (const term of searchTerms) {
            if (titleLower.includes(term)) {
              score += 15; // Medium-high score for title matches
            }
          }
        }
        
        if (score > 5) { // Minimum threshold
          const title = titleLine ? titleLine.replace(/^#\s*/, '') : filename.replace('.md', '');
          const preview = generatePreviewFromContent(content, searchTerms);
          const size = formatFileSize(stats.size);
          
          results.push({
            id: `abap-individual-${version}-${filename.replace('.md', '')}`,
            title: `📄 ${title}`,
            version,
            type: 'individual',
            file: `md/${filename}`,
            score,
            preview,
            size
          });
        }
      }
    } catch (error) {
      // Skip files that can't be read
      continue;
    }
  }
  
  // Sort by score and limit results
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Enhanced search that prioritizes individual files over bundles
 */
export async function improvedAbapSearch(
  query: string,
  version: string = '7.58',
  limit: number = 10
): Promise<{
  results: ImprovedAbapSearchResult[];
  totalFound: number;
  version: string;
  searchStrategy: string;
}> {
  const results: ImprovedAbapSearchResult[] = [];
  
  // 1. Search individual files first (highest priority for specific queries)
  const individualResults = await searchIndividualAbapFiles(query, version, Math.max(limit - 2, 5));
  results.push(...individualResults);
  
  // 2. Add a quick reference if relevant
  try {
    const quickRefPath = path.join(ABAP_DOCS_PATH, version, 'quick-ref', 'abap-statements-quick-ref.md');
    if (existsSync(quickRefPath)) {
      const quickRefContent = await fs.readFile(quickRefPath, 'utf8');
      const queryLower = query.toLowerCase();
      
      if (quickRefContent.toLowerCase().includes(queryLower)) {
        results.unshift({
          id: `abap-quick-ref-${version}-statements`,
          title: `📋 ABAP Statements Quick Reference`,
          version,
          type: 'quick-ref',
          file: 'quick-ref/abap-statements-quick-ref.md',
          score: 100, // Highest priority for quick refs
          preview: `Quick reference for ABAP statements including ${query}`,
          size: '2KB'
        });
      }
    }
  } catch {
    // Skip if quick ref not available
  }
  
  // 3. Add one focused mega-bundle only if query suggests comprehensive coverage
  const comprehensiveKeywords = ['complete', 'all', 'comprehensive', 'everything', 'reference'];
  const needsComprehensive = comprehensiveKeywords.some(kw => query.toLowerCase().includes(kw));
  
  if (needsComprehensive && results.length < limit) {
    // Determine best mega bundle category based on query
    const category = inferCategoryFromQuery(query);
    const megaBundlePath = path.join(ABAP_DOCS_PATH, version, 'mega-bundles', `abap-${category}-complete.md`);
    
    if (existsSync(megaBundlePath)) {
      results.push({
        id: `abap-mega-${version}-${category}`,
        title: `🚀 ABAP ${category.toUpperCase()} - Complete Reference`,
        version,
        type: 'focused-bundle',
        file: `mega-bundles/abap-${category}-complete.md`,
        score: 80,
        preview: `Comprehensive ${category} documentation covering all related topics`,
        size: '2-4MB'
      });
    }
  }
  
  return {
    results: results.slice(0, limit),
    totalFound: results.length,
    version,
    searchStrategy: individualResults.length > 0 ? 'individual-focused' : 'bundle-fallback'
  };
}

/**
 * Infer best mega-bundle category from query
 */
function inferCategoryFromQuery(query: string): string {
  const queryLower = query.toLowerCase();
  
  if (queryLower.includes('select') || queryLower.includes('sql') || queryLower.includes('database')) {
    return 'database';
  }
  if (queryLower.includes('class') || queryLower.includes('object') || queryLower.includes('oop')) {
    return 'oop';
  }
  if (queryLower.includes('cds') || queryLower.includes('view') || queryLower.includes('annotation')) {
    return 'cds';
  }
  if (queryLower.includes('table') || queryLower.includes('structure') || queryLower.includes('data')) {
    return 'data-structures';
  }
  if (queryLower.includes('gui') || queryLower.includes('dynpro') || queryLower.includes('screen')) {
    return 'ui';
  }
  if (queryLower.includes('exception') || queryLower.includes('error') || queryLower.includes('try')) {
    return 'error-handling';
  }
  
  return 'general'; // Default fallback
}

/**
 * Generate preview from content
 */
function generatePreviewFromContent(content: string, searchTerms: string[]): string {
  const lines = content.split('\n').filter(line => line.trim());
  
  // Find the most relevant line containing search terms
  let bestLine = '';
  let bestScore = 0;
  
  for (const line of lines.slice(0, 30)) { // Check first 30 lines only
    const lineLower = line.toLowerCase();
    let lineScore = 0;
    
    for (const term of searchTerms) {
      if (lineLower.includes(term)) {
        lineScore += term.length * 2;
      }
    }
    
    if (lineScore > bestScore && line.length > 20 && !line.startsWith('#')) {
      bestScore = lineScore;
      bestLine = line;
    }
  }
  
  if (bestLine) {
    return bestLine.slice(0, 180) + (bestLine.length > 180 ? '...' : '');
  }
  
  // Fallback to description
  const meaningfulLines = lines.filter(line => 
    !line.startsWith('#') && 
    !line.startsWith('*') && 
    line.length > 15
  );
  
  return meaningfulLines.slice(0, 2).join(' ').slice(0, 180) + '...';
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

/**
 * Get individual ABAP documentation file
 */
export async function getIndividualAbapDoc(
  docId: string,
  version: string = '7.58'
): Promise<string | null> {
  if (!docId.startsWith('abap-individual-')) {
    return null;
  }
  
  try {
    // Extract filename: abap-individual-7.58-filename
    const parts = docId.split('-');
    const filename = parts.slice(3).join('-') + '.md';
    const filePath = path.join(ABAP_DOCS_PATH, version, 'md', filename);
    
    if (!existsSync(filePath)) {
      return null;
    }
    
    const content = await fs.readFile(filePath, 'utf8');
    const stats = await fs.stat(filePath);
    
    return `**ABAP Keyword Documentation (${version}) - Individual Topic**
**File:** ${filename}
**Size:** ${formatFileSize(stats.size)}
**Type:** Focused Documentation

---

${content}

---

*This is an individual documentation file focusing specifically on this topic. For broader context, use sap_docs_search to find related examples and best practices.*

*Official source: https://help.sap.com/doc/abapdocu_${version.replace('.', '')}_index_htm/${version}/en-US/${filename.replace('.md', '.htm')}*`;
    
  } catch (error) {
    console.error(`Error getting individual ABAP doc ${docId}:`, error);
    return null;
  }
}
