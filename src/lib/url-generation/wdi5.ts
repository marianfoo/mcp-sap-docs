/**
 * URL generation for wdi5 testing framework documentation
 * Handles testing guides, API docs, and examples
 */

import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';
import { DocUrlConfig } from '../metadata.js';

export interface Wdi5UrlOptions {
  relFile: string;
  content: string;
  config: DocUrlConfig;
  libraryId: string;
}

/**
 * wdi5 URL Generator
 * Handles wdi5 testing framework documentation with docsify-style URLs
 */
export class Wdi5UrlGenerator extends BaseUrlGenerator {
  
  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    const identifier = this.getIdentifierFromFrontmatter(context.frontmatter);
    
    // Use frontmatter id for docsify-style URLs
    if (identifier) {
      const section = this.extractWdi5Section(context.relFile);
      
      if (section) {
        return this.buildDocsifyUrl(`${section}/${identifier}`);
      }
      
      return this.buildDocsifyUrl(identifier);
    }
    
    // Fallback to filename-based URL
    const section = this.extractWdi5Section(context.relFile);
    const fileName = this.getCleanFileName(context.relFile);
    
    if (section) {
      return this.buildDocsifyUrl(`${section}/${fileName}`);
    }
    
    // Simple filename-based URL with docsify fragment
    const cleanFileName = fileName.replace(/\//g, '-').toLowerCase();
    return this.buildDocsifyUrl(cleanFileName);
  }
  
  /**
   * Extract wdi5-specific sections from file path
   */
  private extractWdi5Section(relFile: string): string {
    if (this.isInDirectory(relFile, 'configuration')) {
      return 'configuration';
    } else if (this.isInDirectory(relFile, 'usage')) {
      return 'usage';
    } else if (this.isInDirectory(relFile, 'selectors')) {
      return 'selectors';
    } else if (this.isInDirectory(relFile, 'locators')) {
      return 'locators'; // Handle locators separately from selectors
    } else if (this.isInDirectory(relFile, 'authentication')) {
      return 'authentication';
    } else if (this.isInDirectory(relFile, 'plugins')) {
      return 'plugins';
    } else if (this.isInDirectory(relFile, 'examples')) {
      return 'examples';
    } else if (this.isInDirectory(relFile, 'migration')) {
      return 'migration';
    } else if (this.isInDirectory(relFile, 'troubleshooting')) {
      return 'troubleshooting';
    }
    
    return '';
  }
  
  /**
   * Override to use wdi5-specific section extraction
   */
  protected extractSection(relFile: string): string {
    return this.extractWdi5Section(relFile);
  }
}

// Convenience functions for backward compatibility

/**
 * Generate URL for wdi5 documentation using the class-based approach
 */
export function generateWdi5Url(options: Wdi5UrlOptions): string | null {
  const generator = new Wdi5UrlGenerator(options.libraryId, options.config);
  return generator.generateUrl(options);
}

/**
 * Generate URL for wdi5 configuration documentation
 */
export function generateWdi5ConfigUrl(options: Wdi5UrlOptions): string | null {
  return generateWdi5Url(options); // Now handled by the main generator
}

/**
 * Generate URL for wdi5 selector and locator documentation
 */
export function generateWdi5SelectorUrl(options: Wdi5UrlOptions): string | null {
  return generateWdi5Url(options); // Now handled by the main generator
}

