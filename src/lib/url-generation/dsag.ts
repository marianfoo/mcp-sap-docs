/**
 * DSAG ABAP Guide URL Generator
 * Handles GitHub Pages URLs for DSAG ABAP Guidelines (English version)
 */

import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';

export interface DsagUrlOptions {
  relFile: string;
  content: string;
  libraryId: string;
}

/**
 * URL Generator for DSAG ABAP Guide (English version)
 * 
 * Transforms docs/path/file.md -> /path/file/
 * Example: docs/clean-core/what-is-clean-core.md -> https://marianfoo.github.io/DSAG-ABAP-Guide/clean-core/what-is-clean-core/
 */
export class DsagUrlGenerator extends BaseUrlGenerator {
  
  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    if (context.frontmatter.permalink) {
      const permalink = context.frontmatter.permalink.startsWith('/')
        ? context.frontmatter.permalink
        : `/${context.frontmatter.permalink}`;
      let url = this.config.baseUrl.replace(/\/$/, '') + permalink;
      if (context.anchor) {
        url += '#' + context.anchor;
      }
      return url;
    }
    
    // Transform the relative file path for GitHub Pages
    // Remove docs/ prefix and .md extension, add trailing slash
    let urlPath = context.relFile;
    
    // Remove docs/ prefix if present
    if (urlPath.startsWith('docs/')) {
      urlPath = urlPath.substring(5);
    }
    
    // Remove .md extension
    urlPath = urlPath.replace(/\.md$/, '');

    if (/^(?:index|README)$/i.test(urlPath)) {
      urlPath = '';
    }
    
    // Build the final URL with trailing slash
    let url = urlPath ? `${this.config.baseUrl}/${urlPath}/` : `${this.config.baseUrl}/`;
    
    // Add anchor if available
    if (context.anchor) {
      url += '#' + context.anchor;
    }
    
    return url;
  }
}

/**
 * Generate DSAG ABAP Guide URL (English version)
 * @param relFile - Relative file path (e.g., "docs/clean-core/what-is-clean-core.md")
 * @param content - File content for extracting anchors
 * @returns Generated GitHub Pages URL with proper path transformation
 */
export function generateDsagUrl(relFile: string, content: string): string {
  const baseUrl = 'https://marianfoo.github.io/DSAG-ABAP-Guide';
  
  // Transform path: docs/clean-core/what-is-clean-core.md -> clean-core/what-is-clean-core/
  let urlPath = relFile;
  if (urlPath.startsWith('docs/')) {
    urlPath = urlPath.substring(5);
  }
  urlPath = urlPath.replace(/\.md$/, '');
  if (/^(?:index|README)$/i.test(urlPath)) {
    urlPath = '';
  }
  
  return urlPath ? `${baseUrl}/${urlPath}/` : `${baseUrl}/`;
}
