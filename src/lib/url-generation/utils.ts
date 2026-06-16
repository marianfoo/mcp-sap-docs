/**
 * Common utilities for URL generation across different documentation sources
 */

import { readSourceContentSync } from '../sourceContent.js';
import matter from 'gray-matter';

export interface FrontmatterData {
  id?: string;
  slug?: string;
  title?: string;
  sidebar_label?: string;
  [key: string]: any;
}

/**
 * Extract frontmatter from document content
 * Supports YAML frontmatter format used in Markdown/MDX files
 */
export function parseFrontmatter(content: string): FrontmatterData {
  try {
    return matter(content).data as FrontmatterData;
  } catch {
    return {};
  }
}

/**
 * Detect the main section/topic from content for anchor generation
 */
export type AnchorStyle = 'docsify' | 'github' | 'custom' | 'sap-help';

function slugifyMarkdownHeading(heading: string, collapseHyphens = false): string {
  let slug = heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}_\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/^-|-$/g, '');

  if (collapseHyphens) {
    slug = slug.replace(/-+/g, '-');
  }

  return slug;
}

export function detectContentSection(content: string, anchorStyle: AnchorStyle): string | null {
  // Find the first major heading (## or #) that gives context about the content
  const headingMatch = content.match(/^#{1,2}\s+(.+)$/m);
  if (!headingMatch) {
    return null;
  }
  
  const heading = headingMatch[1].trim();
  
  // Convert heading to anchor format based on style
  switch (anchorStyle) {
    case 'docsify':
      return slugifyMarkdownHeading(heading, true);
        
    case 'github':
      return slugifyMarkdownHeading(heading);
        
    case 'custom':
    case 'sap-help':
    default:
      // Return as-is for custom handling
      return anchorStyle === 'sap-help' ? null : heading;
  }
}

/**
 * Determine the section path from file relative path
 */
export function extractSectionFromPath(relFile: string): string {
  if (relFile.includes('guides/')) {
    return '/guides/';
  } else if (relFile.includes('features/')) {
    return '/features/';
  } else if (relFile.includes('tutorials/')) {
    return '/tutorials/';
  } else if (relFile.includes('environments/')) {
    return '/environments/';
  } else if (relFile.includes('getting-started/')) {
    return '/getting-started/';
  } else if (relFile.includes('examples/')) {
    return '/examples/';
  } else if (relFile.includes('api/')) {
    return '/api/';
  }
  return '';
}

/**
 * Clean filename for URL usage
 */
export function cleanFilename(filename: string): string {
  return filename
    .replace(/\.mdx?$/, '')  // Remove .md/.mdx extensions
    .replace(/\.html?$/, '') // Remove .html/.htm extensions
    .replace(/\s+/g, '-')    // Spaces to hyphens
    .toLowerCase();
}

/**
 * Build URL with proper path joining
 */
export function buildUrl(baseUrl: string, ...pathSegments: string[]): string {
  const cleanBase = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  const cleanSegments = pathSegments
    .filter(segment => segment && segment.trim() !== '') // Remove empty segments
    .map(segment => segment.replace(/^\/|\/$/g, '')); // Remove leading/trailing slashes
  
  if (cleanSegments.length === 0) {
    return cleanBase;
  }
  
  return `${cleanBase}/${cleanSegments.join('/')}`;
}

/**
 * Extract library ID from document ID path
 * Used for search result URL generation
 */
export function extractLibraryIdFromPath(docId: string): string {
  if (docId.startsWith('/')) {
    const parts = docId.split('/');
    return parts.length > 1 ? `/${parts[1]}` : docId;
  }
  return docId;
}

/**
 * Extract relative file path from document ID
 * Used for search result URL generation
 */
export function extractRelativeFileFromPath(docId: string): string {
  if (docId.includes('/')) {
    const parts = docId.split('/');
    return parts.length > 2 ? parts.slice(2).join('/') : '';
  }
  return '';
}

/**
 * Format a single search result with URL generation and excerpt truncation
 * Shared utility for consistent search result formatting across servers
 */
export function formatSearchResult(
  result: any,
  excerptLength: number,
  urlGenerator?: {
    generateDocumentationUrl: (libraryId: string, relFile: string, content: string, config: any) => string | null;
    getDocUrlConfig: (libraryId: string) => any;
  }
): string {
  // Extract library ID and relative file path to generate URL
  const libraryId = result.sourceId ? `/${result.sourceId}` : extractLibraryIdFromPath(result.id);
  const relFile = result.relFile || extractRelativeFileFromPath(result.id);
  
  // Try to generate documentation URL
  let urlInfo = '';
  if (urlGenerator) {
    try {
      const config = urlGenerator.getDocUrlConfig && urlGenerator.getDocUrlConfig(libraryId);
      if (config && urlGenerator.generateDocumentationUrl) {
        const sourceContent = readSourceContentSync(libraryId, relFile);
        const docUrl = urlGenerator.generateDocumentationUrl(libraryId, relFile, sourceContent || result.text || '', config);
        if (docUrl) {
          urlInfo = `\n   🔗 ${docUrl}`;
        }
      }
    } catch (error) {
      // Silently fail URL generation
      console.warn(`URL generation failed for ${libraryId}/${relFile}:`, error);
    }
  }
  
  return `⭐️ **${result.id}** (Score: ${result.finalScore.toFixed(2)})\n   ${(result.text || '').substring(0, excerptLength)}${urlInfo}\n   Use in fetch\n`;
}
