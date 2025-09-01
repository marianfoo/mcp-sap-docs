/**
 * DSAG ABAP Leitfaden URL Generator
 * Handles GitHub Pages URLs for DSAG ABAP Guidelines
 */

import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';

export interface DsagUrlOptions {
  relFile: string;
  content: string;
  libraryId: string;
}

/**
 * URL Generator for DSAG ABAP Leitfaden
 * 
 * Transforms docs/path/file.md -> /path/file/
 * Example: docs/clean-core/what-is-clean-core.md -> https://1dsag.github.io/ABAP-Leitfaden/clean-core/what-is-clean-core/
 */
export class DsagUrlGenerator extends BaseUrlGenerator {
  
  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    
    // Transform the relative file path for GitHub Pages
    // Remove docs/ prefix and .md extension, add trailing slash
    let urlPath = context.relFile;
    
    // Remove docs/ prefix if present
    if (urlPath.startsWith('docs/')) {
      urlPath = urlPath.substring(5);
    }
    
    // Remove .md extension
    urlPath = urlPath.replace(/\.md$/, '');
    
    // Build the final URL with trailing slash
    let url = `${this.config.baseUrl}/${urlPath}/`;
    
    // Add anchor if available
    if (context.anchor) {
      url += '#' + context.anchor;
    }
    
    return url;
  }
}

/**
 * Generate DSAG ABAP Leitfaden URL
 * @param relFile - Relative file path (e.g., "docs/clean-core/what-is-clean-core.md")
 * @param content - File content for extracting anchors
 * @returns Generated GitHub Pages URL with proper path transformation
 */
export function generateDsagUrl(relFile: string, content: string): string {
  const baseUrl = 'https://1dsag.github.io/ABAP-Leitfaden';
  
  // Transform path: docs/clean-core/what-is-clean-core.md -> clean-core/what-is-clean-core/
  let urlPath = relFile;
  if (urlPath.startsWith('docs/')) {
    urlPath = urlPath.substring(5);
  }
  urlPath = urlPath.replace(/\.md$/, '');
  
  return `${baseUrl}/${urlPath}/`;
}
