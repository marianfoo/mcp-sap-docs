/**
 * URL generation for SAP CAP (Cloud Application Programming) documentation
 * Handles CDS guides, reference docs, and tutorials
 */

import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';
import { DocUrlConfig } from '../metadata.js';

export interface CapUrlOptions {
  relFile: string;
  content: string;
  config: DocUrlConfig;
  libraryId: string;
}

/**
 * CAP URL Generator
 * Handles CDS guides, reference docs, and tutorials with docsify-style URLs
 */
export class CapUrlGenerator extends BaseUrlGenerator {
  
  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    const identifier = this.getIdentifierFromFrontmatter(context.frontmatter);
    
    // Use frontmatter slug or id for URL generation
    if (identifier) {
      const section = this.extractCapSection(context.relFile);
      
      if (section) {
        return this.buildDocsifyUrl(`${section}/${identifier}`);
      }
      
      return this.buildDocsifyUrl(identifier);
    }
    
    // Fallback to filename-based URL
    const fileName = this.getCleanFileName(context.relFile);
    const section = this.extractCapSection(context.relFile);
    
    if (section) {
      return this.buildDocsifyUrl(`${section}/${fileName}`);
    }
    
    return this.buildDocsifyUrl(fileName);
  }
  
  /**
   * Extract CAP-specific sections from file path
   */
  private extractCapSection(relFile: string): string {
    if (this.isInDirectory(relFile, 'guides')) {
      return 'guides';
    } else if (this.isInDirectory(relFile, 'cds')) {
      return 'cds';
    } else if (this.isInDirectory(relFile, 'node.js')) {
      return 'node.js';
    } else if (this.isInDirectory(relFile, 'java')) {
      return 'java';
    } else if (this.isInDirectory(relFile, 'plugins')) {
      return 'plugins';
    } else if (this.isInDirectory(relFile, 'advanced')) {
      return 'advanced';
    } else if (this.isInDirectory(relFile, 'get-started')) {
      return 'get-started';
    } else if (this.isInDirectory(relFile, 'tutorials')) {
      return 'tutorials';
    }
    
    return '';
  }
  
  /**
   * Override to use CAP-specific section extraction
   */
  protected extractSection(relFile: string): string {
    return this.extractCapSection(relFile);
  }
  
  /**
   * Override to use CAP-specific docsify URL building
   * CAP URLs have a /docs/ prefix before the # fragment
   */
  protected buildDocsifyUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${this.config.baseUrl}/docs/#/${cleanPath}`;
  }
}

// Convenience functions for backward compatibility

/**
 * Generate URL for CAP documentation using the class-based approach
 */
export function generateCapUrl(options: CapUrlOptions): string | null {
  const generator = new CapUrlGenerator(options.libraryId, options.config);
  return generator.generateUrl(options);
}

/**
 * Generate URL for CAP CDS reference documentation
 */
export function generateCapCdsUrl(options: CapUrlOptions): string | null {
  return generateCapUrl(options); // Now handled by the main generator
}

/**
 * Generate URL for CAP tutorials and getting started guides
 */
export function generateCapTutorialUrl(options: CapUrlOptions): string | null {
  return generateCapUrl(options); // Now handled by the main generator
}

