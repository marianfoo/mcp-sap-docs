/**
 * ABAP Keyword Documentation Tools
 * 
 * Provides dedicated search and retrieval tools for ABAP keyword documentation
 * across multiple ABAP versions with intelligent bundling and individual file access.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this script and find the project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find project root by looking for package.json
function findProjectRoot(startPath: string): string {
  let currentPath = startPath;
  while (currentPath !== path.dirname(currentPath)) {
    if (existsSync(path.join(currentPath, 'package.json'))) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }
  throw new Error('Could not find project root (package.json not found)');
}

const PROJECT_ROOT = findProjectRoot(__dirname);
const ABAP_DOCS_PATH = path.join(PROJECT_ROOT, 'sources', 'abap-docs', 'docs');

export interface AbapBundle {
  title: string;
  file: string;
  count: number;
  keywords?: string[];
  topics?: string[];
  difficulty?: string;
  category?: string;
  statements?: string[];
}

export interface AbapSearchResult {
  id: string;
  title: string;
  version: string;
  type: 'individual' | 'quick-ref' | 'bundle' | 'mega-bundle';
  file: string;
  score: number;
  preview: string;
  category?: string;
  difficulty?: string;
  size?: string;
  sourceUrl?: string;
}

export interface AbapSearchResponse {
  results: AbapSearchResult[];
  totalFound: number;
  version: string;
  searchTerm: string;
}

export interface EnhancedBundleIndex {
  metadata: {
    version: string;
    bundleCount: number;
    generatedAt: string;
    keywords: string[];
  };
  bundles: AbapBundle[];
  quickRef: AbapBundle[];
  megaBundles: AbapBundle[];
}

/**
 * Get available ABAP versions
 */
export async function getAvailableVersions(): Promise<string[]> {
  if (!existsSync(ABAP_DOCS_PATH)) {
    throw new Error('ABAP docs not available. Run ./setup.sh to initialize submodules.');
  }
  
  const entries = await fs.readdir(ABAP_DOCS_PATH, { withFileTypes: true });
  const versions = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  
  return versions;
}

/**
 * Get enhanced bundles index for a specific version
 */
export async function getEnhancedBundlesIndex(version: string = '7.58'): Promise<EnhancedBundleIndex> {
  const enhancedIndexPath = path.join(ABAP_DOCS_PATH, version, 'enhanced_bundles_index.json');
  
  if (!existsSync(enhancedIndexPath)) {
    // Fallback to original bundles index if enhanced version not available
    const bundlesIndexPath = path.join(ABAP_DOCS_PATH, version, 'bundles_index.json');
    if (!existsSync(bundlesIndexPath)) {
      throw new Error(`Neither enhanced nor regular bundles index found for version ${version}`);
    }
    
    const content = await fs.readFile(bundlesIndexPath, 'utf8');
    const data = JSON.parse(content);
    return {
      metadata: {
        version,
        bundleCount: data.bundles?.length || 0,
        generatedAt: new Date().toISOString(),
        keywords: []
      },
      bundles: data.bundles || [],
      quickRef: [],
      megaBundles: []
    };
  }
  
  const content = await fs.readFile(enhancedIndexPath, 'utf8');
  return JSON.parse(content);
}

/**
 * Get bundles index for a specific version (legacy compatibility)
 */
export async function getBundlesIndex(version: string = '7.58'): Promise<AbapBundle[]> {
  const enhancedIndex = await getEnhancedBundlesIndex(version);
  return enhancedIndex.bundles;
}

/**
 * Read a bundle file (supports bundles, mega-bundles, and quick-ref)
 */
export async function readBundle(version: string, bundleFile: string): Promise<string> {
  const fullPath = path.join(ABAP_DOCS_PATH, version, bundleFile);
  
  if (!existsSync(fullPath)) {
    throw new Error(`Bundle file not found: ${bundleFile} (version ${version})`);
  }
  
  return await fs.readFile(fullPath, 'utf8');
}

/**
 * Read a mega bundle file
 */
export async function readMegaBundle(version: string, category: string): Promise<string> {
  const fullPath = path.join(ABAP_DOCS_PATH, version, 'mega-bundles', `abap-${category}-complete.md`);
  
  if (!existsSync(fullPath)) {
    throw new Error(`Mega bundle not found: abap-${category}-complete.md (version ${version})`);
  }
  
  return await fs.readFile(fullPath, 'utf8');
}

/**
 * Read a quick reference file
 */
export async function readQuickRef(version: string, refType: string): Promise<string> {
  const fullPath = path.join(ABAP_DOCS_PATH, version, 'quick-ref', `abap-${refType}.md`);
  
  if (!existsSync(fullPath)) {
    throw new Error(`Quick reference not found: abap-${refType}.md (version ${version})`);
  }
  
  return await fs.readFile(fullPath, 'utf8');
}

/**
 * Read an individual markdown file
 */
export async function readIndividualFile(version: string, filePath: string): Promise<string> {
  const fullPath = path.join(ABAP_DOCS_PATH, version, 'md', filePath);
  
  if (!existsSync(fullPath)) {
    throw new Error(`Individual file not found: ${filePath} (version ${version})`);
  }
  
  return await fs.readFile(fullPath, 'utf8');
}

/**
 * Search individual ABAP files using optimized index (optimal for LLM consumption)
 */
async function searchIndividualFiles(
  query: string,
  version: string,
  limit: number
): Promise<AbapSearchResult[]> {
  try {
    // Try to use optimized index first
    const optimizedIndexPath = path.join(ABAP_DOCS_PATH, version, 'optimized_index.json');
    
    if (existsSync(optimizedIndexPath)) {
      const optimizedIndex = JSON.parse(await fs.readFile(optimizedIndexPath, 'utf8'));
      return searchFromOptimizedIndex(query, version, limit, optimizedIndex);
    }
    
    // Fallback to directory scanning if optimized index not available
    return searchIndividualFilesFromDirectory(query, version, limit);
    
  } catch (error) {
    console.warn(`Error in searchIndividualFiles:`, error);
    return [];
  }
}

/**
 * Search using optimized index for better performance
 */
function searchFromOptimizedIndex(
  query: string,
  version: string, 
  limit: number,
  optimizedIndex: any
): AbapSearchResult[] {
  const results: AbapSearchResult[] = [];
  const searchTerms = query.toLowerCase().split(/\s+/);
  const queryLower = query.toLowerCase();
  
  // Search through individual files in optimized index
  for (const file of optimizedIndex.individualFiles || []) {
    let score = 0;
    
    // Filename matching (highest priority)
    const filename = file.file.replace('md/', '');
    const filenameLower = filename.toLowerCase();
    
    for (const term of searchTerms) {
      if (filenameLower.includes(term)) {
        score += 25;
      }
    }
    
    // Title matching
    if (file.title) {
      const titleLower = file.title.toLowerCase();
      for (const term of searchTerms) {
        if (titleLower.includes(term)) {
          score += 20;
        }
      }
    }
    
    // Keywords matching
    if (file.keywords) {
      for (const keyword of file.keywords) {
        const keywordLower = keyword.toLowerCase();
        for (const term of searchTerms) {
          if (keywordLower.includes(term) || term.includes(keywordLower)) {
            score += 10;
          }
        }
      }
    }
    
    // Search text matching
    if (file.searchText) {
      const searchTextLower = file.searchText.toLowerCase();
      for (const term of searchTerms) {
        if (searchTextLower.includes(term)) {
          score += 5;
        }
      }
    }
    
    if (score > 8) { // Threshold for individual files
      const size = formatFileSize(file.size || 0);
      const sourceUrl = generateSourceUrl(filename, version);
      const preview = generatePreviewFromMetadata(file, searchTerms);
      
      results.push({
        id: `abap-individual-${version}-${filename.replace('.md', '')}`,
        title: `📄 ${file.title || filename.replace('.md', '').replace('aben', '')}`,
        version,
        type: 'individual',
        file: file.file,
        score,
        preview,
        size,
        sourceUrl,
        category: file.category,
        difficulty: file.difficulty
      });
    }
  }
  
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Fallback: Search individual files from directory
 */
async function searchIndividualFilesFromDirectory(
  query: string,
  version: string,
  limit: number
): Promise<AbapSearchResult[]> {
  const mdPath = path.join(ABAP_DOCS_PATH, version, 'md');
  
  if (!existsSync(mdPath)) {
    return [];
  }
  
  const results: AbapSearchResult[] = [];
  const searchTerms = query.toLowerCase().split(/\s+/);
  
  try {
    // Get all MD files and filter by relevance
    const allFiles = await fs.readdir(mdPath);
    const potentialFiles = allFiles.filter(filename => {
      const filenameLower = filename.toLowerCase();
      return searchTerms.some(term => filenameLower.includes(term));
    });
    
    // Process potentially relevant files
    for (const filename of potentialFiles.slice(0, 100)) {
      const filePath = path.join(mdPath, filename);
      
      try {
        const stats = await fs.stat(filePath);
        const filenameLower = filename.toLowerCase();
        
        let score = 0;
        
        // Score based on filename matches
        for (const term of searchTerms) {
          if (filenameLower.includes(term)) {
            score += 25;
          }
        }
        
        if (score > 8) {
          const content = await fs.readFile(filePath, 'utf8');
          const lines = content.split('\n');
          const titleLine = lines.find(line => line.trim() && !line.startsWith('*') && !line.startsWith('#####'));
          const title = titleLine?.trim() || filename.replace('.md', '').replace('aben', '');
          
          // Additional title scoring
          const titleLower = title.toLowerCase();
          for (const term of searchTerms) {
            if (titleLower.includes(term)) {
              score += 20;
            }
          }
          
          const preview = generatePreviewFromIndividualFile(content, searchTerms);
          const size = formatFileSize(stats.size);
          const sourceUrl = generateSourceUrl(filename, version);
          
          results.push({
            id: `abap-individual-${version}-${filename.replace('.md', '')}`,
            title: `📄 ${title}`,
            version,
            type: 'individual',
            file: `md/${filename}`,
            score,
            preview,
            size,
            sourceUrl
          });
        }
      } catch (error) {
        continue;
      }
    }
  } catch (error) {
    console.warn(`Error searching individual files from directory:`, error);
  }
  
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Generate preview from optimized index metadata
 */
function generatePreviewFromMetadata(file: any, searchTerms: string[]): string {
  if (file.keywords && file.keywords.length > 0) {
    const relevantKeywords = file.keywords.filter((keyword: string) =>
      searchTerms.some(term => keyword.toLowerCase().includes(term))
    );
    
    if (relevantKeywords.length > 0) {
      return `${file.category || 'ABAP'} | ${file.difficulty || 'intermediate'} | Keywords: ${relevantKeywords.slice(0, 5).join(', ')}`;
    }
  }
  
  return `${file.category || 'ABAP'} documentation | ${file.difficulty || 'intermediate'} level`;
}

/**
 * Optimal ABAP search - Individual files first for best LLM experience
 */
export async function searchAbapDocs(
  query: string, 
  version: string = '7.58',
  limit: number = 10
): Promise<AbapSearchResponse> {
  const results: AbapSearchResult[] = [];
  const seenTitles = new Set<string>(); // For deduplication
  
  // 🥇 PRIORITY 1: Individual Files (1-10KB - Perfect for LLMs)
  const individualResults = await searchIndividualFiles(query, version, Math.min(limit, 7));
  for (const result of individualResults) {
    if (!seenTitles.has(result.title)) {
      seenTitles.add(result.title);
      results.push(result);
    }
  }
  
  // 🥈 PRIORITY 2: Quick References (Fast lookups)
  if (results.length < limit) {
    try {
      const quickRefPath = path.join(ABAP_DOCS_PATH, version, 'quick-ref', 'abap-statements-quick-ref.md');
      if (existsSync(quickRefPath)) {
        const quickRefContent = await fs.readFile(quickRefPath, 'utf8');
        const queryLower = query.toLowerCase();
        
        if (quickRefContent.toLowerCase().includes(queryLower)) {
          results.push({
            id: `abap-quick-ref-${version}-statements`,
            title: `📋 ABAP Statements Quick Reference`,
            version,
            type: 'quick-ref',
            file: 'quick-ref/abap-statements-quick-ref.md',
            score: 90,
            preview: `Quick reference for ABAP statements including ${query}`,
            size: '2KB',
            sourceUrl: `https://help.sap.com/doc/abapdocu_${version.replace('.', '')}_index_htm/${version}/en-US/index.htm`
          });
        }
      }
    } catch {
      // Skip if quick ref not available
    }
  }
  
  // 🥉 PRIORITY 3: Focused Bundles (Only for broader queries)
  if (results.length < limit) {
    const enhancedIndex = await getEnhancedBundlesIndex(version);
    const searchTerms = query.toLowerCase().split(/\s+/);
    const queryLower = query.toLowerCase();
    
    // Only search smaller bundles (< 50KB equivalent)
    const focusedBundles = enhancedIndex.bundles.filter(bundle => 
      !bundle.file.includes('mega-bundles') && (bundle.count || 0) <= 10
    );
    
    for (const bundle of focusedBundles.slice(0, 20)) { // Limit for performance
      if (seenTitles.has(bundle.title)) continue;
      
      const score = calculateSearchScore(bundle, searchTerms, queryLower);
      if (score > 5) {
        seenTitles.add(bundle.title);
        
        const preview = `Focused bundle covering ${bundle.count || 'multiple'} related topics`;
        
        results.push({
          id: `abap-${version}-bundle-${bundle.file.replace(/[^a-zA-Z0-9]/g, '-')}`,
          title: `📦 ${bundle.title}`,
          version,
          type: 'bundle',
          file: bundle.file,
          score: score - 5, // Lower priority than individual files
          preview,
          category: bundle.category,
          difficulty: bundle.difficulty,
          size: `~${(bundle.count || 1) * 8}KB`
        });
      }
    }
  }
  
  // 🏅 PRIORITY 4: Mega Bundles (Only for comprehensive queries)
  const comprehensiveKeywords = ['complete', 'comprehensive', 'all', 'everything', 'reference'];
  const needsComprehensive = comprehensiveKeywords.some(kw => query.toLowerCase().includes(kw));
  
  if (needsComprehensive && results.length < limit) {
    const category = inferCategoryFromQuery(query);
    const megaBundlePath = path.join(ABAP_DOCS_PATH, version, 'mega-bundles', `abap-${category}-complete.md`);
    
    if (existsSync(megaBundlePath)) {
      results.push({
        id: `abap-mega-${version}-${category}`,
        title: `🚀 ABAP ${category.toUpperCase()} - Complete Reference`,
        version,
        type: 'mega-bundle',
        file: `mega-bundles/abap-${category}-complete.md`,
        score: 60,
        preview: `Comprehensive ${category} documentation covering all related topics`,
        size: '2-4MB',
        sourceUrl: `https://help.sap.com/doc/abapdocu_${version.replace('.', '')}_index_htm/${version}/en-US/index.htm`
      });
    }
  }
  
  // Sort by score (individual files will naturally be at top due to higher scores)
  results.sort((a, b) => b.score - a.score);
  
  return {
    results: results.slice(0, limit),
    totalFound: results.length,
    version,
    searchTerm: query
  };
}

/**
 * Enhanced scoring algorithm for ABAP documentation
 */
function calculateSearchScore(bundle: AbapBundle, searchTerms: string[], queryLower: string): number {
  let score = 0;
  const titleLower = bundle.title.toLowerCase();
  
  // 1. Title matching (highest weight)
  for (const term of searchTerms) {
    if (titleLower.includes(term)) {
      score += 15; // High score for title matches
    }
  }
  
  // 2. Keywords matching (if available)
  if (bundle.keywords) {
    for (const keyword of bundle.keywords) {
      const keywordLower = keyword.toLowerCase();
      for (const term of searchTerms) {
        if (keywordLower.includes(term) || term.includes(keywordLower)) {
          score += 8; // Medium-high score for keyword matches
        }
      }
    }
  }
  
  // 3. Topics matching (if available)
  if (bundle.topics) {
    for (const topic of bundle.topics) {
      const topicLower = topic.toLowerCase();
      for (const term of searchTerms) {
        if (topicLower.includes(term) || term.includes(topicLower)) {
          score += 5; // Medium score for topic matches
        }
      }
    }
  }
  
  // 4. Statements matching (if available)
  if (bundle.statements) {
    for (const statement of bundle.statements) {
      const statementLower = statement.toLowerCase();
      for (const term of searchTerms) {
        if (statementLower === term || statementLower.includes(term)) {
          score += 12; // High score for exact statement matches
        }
      }
    }
  }
  
  // 5. Category matching (if available)
  if (bundle.category) {
    const categoryLower = bundle.category.toLowerCase();
    if (searchTerms.some(term => categoryLower.includes(term))) {
      score += 3; // Lower score for category matches
    }
  }
  
  // 6. Exact phrase matching bonus
  if (titleLower.includes(queryLower)) {
    score += 10; // Bonus for exact phrase in title
  }
  
  return score;
}

/**
 * Generate enhanced preview with better context
 */
function generateEnhancedPreview(content: string, searchTerms: string[]): string {
  const lines = content.split('\n').filter(line => line.trim());
  
  // Find the first line that contains any search term with context
  let bestMatch = '';
  let bestScore = 0;
  
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();
    let lineScore = 0;
    
    for (const term of searchTerms) {
      if (lineLower.includes(term)) {
        lineScore += term.length;
      }
    }
    
    if (lineScore > bestScore) {
      bestScore = lineScore;
      bestMatch = line;
    }
  }
  
  if (bestMatch) {
    return bestMatch.slice(0, 200) + (bestMatch.length > 200 ? '...' : '');
  }
  
  // Fallback to first meaningful content
  const meaningfulLines = lines.filter(line => 
    !line.startsWith('#') && 
    !line.startsWith('**') && 
    line.length > 20
  );
  
  return meaningfulLines.slice(0, 2).join(' ').slice(0, 200) + '...';
}

/**
 * Get specific ABAP documentation by ID (enhanced with individual files priority)
 */
export async function getAbapDoc(
  docId: string,
  version: string = '7.58'
): Promise<string | null> {
  
  if (!docId.startsWith('abap-')) {
    return null;
  }
  
  try {
    // Handle individual files (highest priority)
    if (docId.includes('individual-')) {
      const parts = docId.split('-');
      const filename = parts.slice(3).join('-') + '.md';
      const filePath = path.join(ABAP_DOCS_PATH, version, 'md', filename);
      
      if (existsSync(filePath)) {
        const content = await fs.readFile(filePath, 'utf8');
        const stats = await fs.stat(filePath);
        
        return formatIndividualFile(filename, content, version, stats.size);
      }
    }
    
    // Handle quick references
    if (docId.includes('quick-ref-')) {
      const refType = docId.includes('statements') ? 'statements-quick-ref' : 'topics-index';
      const content = await readQuickRef(version, refType);
      
      return `**ABAP Quick Reference (${version})**
**Type:** Quick Reference Guide
**Size:** ~2KB
**Optimized for:** Instant lookup

---

${content}

---

*This is a quick reference guide for immediate lookup of common ABAP statements and concepts. For detailed syntax, use abap_search with specific statement names.*`;
    }
    
    // Handle mega bundles (comprehensive)
    if (docId.includes('mega-')) {
      const category = docId.replace(`abap-mega-${version}-`, '');
      const content = await readMegaBundle(version, category);
      
      return `**ABAP Keyword Documentation (${version}) - Comprehensive Guide**
**Category:** ${category.toUpperCase()}
**Type:** Complete Reference  
**Size:** 2-4MB
**⚠️  Note:** Large file - consider using abap_search for specific topics

---

${content}

---

*This is a comprehensive mega-bundle covering all ${category} related documentation. For focused content, search for specific topics using abap_search.*

*Official source: https://help.sap.com/doc/abapdocu_${version.replace('.', '')}_index_htm/${version}/en-US/index.htm*`;
    }
    
    // Handle regular bundles
    if (docId.includes('bundle-')) {
      const enhancedIndex = await getEnhancedBundlesIndex(version);
      
      for (const bundle of enhancedIndex.bundles) {
        const expectedId = `abap-${version}-bundle-${bundle.file.replace(/[^a-zA-Z0-9]/g, '-')}`;
        if (docId === expectedId) {
          const content = await readBundle(version, bundle.file);
          return formatAbapDoc(bundle, content, version, 'Focused Bundle');
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error getting ABAP doc ${docId}:`, error);
    return null;
  }
}

/**
 * Format individual file for optimal LLM consumption
 */
function formatIndividualFile(filename: string, content: string, version: string, fileSize: number): string {
  const sourceUrl = generateSourceUrl(filename, version);
  const size = formatFileSize(fileSize);
  
  // Extract title from content
  const lines = content.split('\n');
  const titleLine = lines.find(line => line.trim() && !line.startsWith('*') && !line.startsWith('#####'));
  const title = titleLine?.trim() || filename.replace('.md', '').replace('aben', '');
  
  return `**ABAP Keyword Documentation (${version}) - Individual Topic**
**Title:** ${title}
**File:** ${filename}
**Size:** ${size} (Optimal for LLM)
**Type:** Focused Documentation
**📖 Official Source:** [${filename.replace('.md', '.htm')}](${sourceUrl})

---

${content}

---

*✅ This individual file is optimized for LLM consumption with focused, relevant content.*
*🔗 All source links have been converted from JavaScript to proper URLs.*
*📖 For the complete official documentation, visit the source URL above.*`;
}

/**
 * Format ABAP documentation for display (enhanced with content type support)
 */
function formatAbapDoc(bundle: AbapBundle, content: string, version: string, contentType: string = 'Documentation Bundle'): string {
  let header = `**ABAP Keyword Documentation (${version}) - ${contentType}**\n`;
  header += `**Title:** ${bundle.title}\n`;
  
  if (bundle.count) {
    header += `**Files Combined:** ${bundle.count}\n`;
  }
  
  if (bundle.category) {
    header += `**Category:** ${bundle.category}\n`;
  }
  
  if (bundle.difficulty) {
    header += `**Difficulty:** ${bundle.difficulty}\n`;
  }
  
  if (bundle.keywords && bundle.keywords.length > 0) {
    header += `**Keywords:** ${bundle.keywords.slice(0, 10).join(', ')}\n`;
  }
  
  if (bundle.statements && bundle.statements.length > 0) {
    header += `**ABAP Statements:** ${bundle.statements.slice(0, 8).join(', ')}\n`;
  }

  let footer = '';
  if (contentType === 'Comprehensive Guide') {
    footer = `*This is a comprehensive mega-bundle combining all ${bundle.category || 'ABAP'} related documentation for complete coverage of the topic.*`;
  } else if (contentType === 'Quick Reference') {
    footer = `*This is a quick reference guide for immediate lookup of common ABAP statements and concepts.*`;
  } else {
    footer = `*This bundle combines ${bundle.count || 'multiple'} related ABAP documentation files for easier consumption.*`;
  }

  return `${header}
---

${content}

---

${footer}

*For the official SAP documentation, visit: https://help.sap.com/doc/abapdocu_${version.replace('.', '')}_index_htm/${version}/en-US/index.htm*`;
}

/**
 * List all available documentation bundles for a version
 */
export async function listAbapBundles(version: string = '7.58'): Promise<string[]> {
  const enhancedIndex = await getEnhancedBundlesIndex(version);
  return enhancedIndex.bundles.map(bundle => bundle.title);
}

/**
 * Get available mega bundle categories for a version
 */
export async function getMegaBundleCategories(version: string = '7.58'): Promise<string[]> {
  const enhancedIndex = await getEnhancedBundlesIndex(version);
  return enhancedIndex.megaBundles?.map(mb => mb.category || 'general') || [];
}

/**
 * Get available quick reference types for a version
 */
export async function getQuickRefTypes(version: string = '7.58'): Promise<string[]> {
  const enhancedIndex = await getEnhancedBundlesIndex(version);
  return enhancedIndex.quickRef?.map(qr => qr.title) || [];
}

/**
 * Get version manifest information
 */
export async function getVersionManifest(version: string = '7.58'): Promise<any> {
  const manifestPath = path.join(ABAP_DOCS_PATH, version, '_manifest.json');
  
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found for version ${version}`);
  }
  
  const content = await fs.readFile(manifestPath, 'utf8');
  return JSON.parse(content);
}

/**
 * Generate preview from individual file content
 */
function generatePreviewFromIndividualFile(content: string, searchTerms: string[]): string {
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
    
    if (lineScore > bestScore && line.length > 15 && !line.startsWith('#') && !line.startsWith('*')) {
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
    !line.includes('javascript:') &&
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
 * Generate source URL for individual file
 */
function generateSourceUrl(filename: string, version: string): string {
  const htmlFilename = filename.replace('.md', '.htm');
  return `https://help.sap.com/doc/abapdocu_${version.replace('.', '')}_index_htm/${version}/en-US/${htmlFilename}`;
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
  if (queryLower.includes('type') || queryLower.includes('define')) {
    return 'types';
  }
  
  return 'general'; // Default fallback
}
