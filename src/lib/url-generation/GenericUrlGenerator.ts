/**
 * Generic URL Generator for sources without specialized logic
 * Handles ui5-tooling, ui5-webcomponents, cloud-mta-build-tool, etc.
 */

import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';

/**
 * Generic URL Generator
 * Uses configuration-based URL generation for sources without special requirements
 */
export class GenericUrlGenerator extends BaseUrlGenerator {
  
  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    const identifier = this.getIdentifierFromFrontmatter(context.frontmatter);
    
    // Use frontmatter ID if available
    if (identifier) {
      // Use the pathPattern to construct the URL properly
      let url = this.config.pathPattern.replace('{file}', identifier);
      url = this.config.baseUrl + url;
      
      // Add anchor if available
      if (context.anchor) {
        url += this.getSeparator() + context.anchor;
      }
      
      return url;
    }
    
    return null; // Let fallback handle filename-based generation
  }
}
