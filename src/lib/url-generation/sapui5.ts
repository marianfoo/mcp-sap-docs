/**
 * URL generation for SAPUI5 documentation sources
 * Handles SAPUI5 guides, API docs, and samples
 */

import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';
import { DocUrlConfig } from '../metadata.js';

export interface SapUi5UrlOptions {
  relFile: string;
  content: string;
  config: DocUrlConfig;
  libraryId: string;
}

/**
 * SAPUI5 URL Generator
 * Handles SAPUI5 guides, OpenUI5 API docs, and samples with different URL patterns
 */
export class SapUi5UrlGenerator extends BaseUrlGenerator {
  
  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    
    switch (this.libraryId) {
      case '/sapui5':
        return this.generateSapUi5Url(context);
      case '/openui5-api':
        return this.generateOpenUi5ApiUrl(context);
      case '/openui5-samples':
        return this.generateOpenUi5SampleUrl(context);
      default:
        return this.generateSapUi5Url(context);
    }
  }
  
  /**
   * Generate URL for SAPUI5 documentation
   * SAPUI5 uses topic-based URLs with # fragments
   */
  private generateSapUi5Url(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    // SAPUI5 docs often have topic IDs in frontmatter
    const topicId = context.frontmatter.id || context.frontmatter.topic;
    if (topicId) {
      return `${this.config.baseUrl}/#/topic/${topicId}`;
    }

    // SAPUI5 docs also use HTML comments with loio pattern: <!-- loio{id} -->
    const loioMatch = context.content?.match(/<!--\s*loio([a-f0-9]+)\s*-->/);
    if (loioMatch) {
      return `${this.config.baseUrl}/#/topic/${loioMatch[1]}`;
    }
    
    // Extract topic ID from filename if following SAPUI5 conventions (UUID pattern)
    const topicIdMatch = context.relFile.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (topicIdMatch) {
      return `${this.config.baseUrl}/#/topic/${topicIdMatch[1]}`;
    }
    
    return null; // Let fallback handle it
  }
  
  /**
   * Generate URL for OpenUI5 API documentation
   * API docs use control/namespace-based URLs
   */
  private generateOpenUi5ApiUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    // Extract control name from file path (e.g., src/sap/m/Button.js -> sap.m.Button)
    const pathMatch = context.relFile.match(/src\/(sap\/[^\/]+\/[^\/]+)\.js$/);
    if (pathMatch) {
      const controlPath = pathMatch[1].replace(/\//g, '.');
      return `${this.config.baseUrl}/#/api/${controlPath}`;
    }
    
    // Alternative pattern matching
    const controlMatch = context.relFile.match(/\/([^\/]+)\.js$/);
    if (controlMatch) {
      const controlName = controlMatch[1];
      
      // Check if it's a full namespace path
      if (controlName.includes('.')) {
        return `${this.config.baseUrl}/#/api/${controlName}`;
      }
      
      // Try to extract namespace from content
      const namespaceMatch = context.content.match(/sap\.([a-z]+\.[A-Za-z0-9_]+)/);
      if (namespaceMatch) {
        return `${this.config.baseUrl}/#/api/${namespaceMatch[0]}`;
      }
      
      // Fallback to control name only
      return `${this.config.baseUrl}/#/api/${controlName}`;
    }
    
    return null; // Let fallback handle it
  }
  
  /**
   * Generate URL for OpenUI5 samples
   * Samples use sample-specific paths without # prefix
   */
  private generateOpenUi5SampleUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    // Extract sample ID from path patterns like:
    // /src/sap.m/test/sap/m/demokit/sample/ButtonWithBadge/Component.js
    const sampleMatch = context.relFile.match(/sample\/([^\/]+)\/([^\/]+)$/);
    if (sampleMatch) {
      const [, sampleName, fileName] = sampleMatch;
      // For samples, we construct the sample entity URL without # prefix
      return `${this.config.baseUrl}/entity/sap.m.Button/sample/sap.m.sample.${sampleName}`;
    }
    
    // Alternative pattern for samples
    const buttonSampleMatch = context.relFile.match(/\/([^\/]+)\/test\/sap\/m\/demokit\/sample\/([^\/]+)\//);
    if (buttonSampleMatch) {
      const [, controlLibrary, sampleName] = buttonSampleMatch;
      return `${this.config.baseUrl}/entity/sap.${controlLibrary}.Button/sample/sap.${controlLibrary}.sample.${sampleName}`;
    }
    
    return null; // Let fallback handle it
  }
}

// Convenience functions for backward compatibility

/**
 * Generate URL for SAPUI5 documentation using the class-based approach
 */
export function generateSapUi5Url(options: SapUi5UrlOptions): string | null {
  const generator = new SapUi5UrlGenerator(options.libraryId, options.config);
  return generator.generateUrl(options);
}

/**
 * Generate URL for OpenUI5 API documentation
 */
export function generateOpenUi5ApiUrl(options: SapUi5UrlOptions): string | null {
  const generator = new SapUi5UrlGenerator('/openui5-api', options.config);
  return generator.generateUrl(options);
}

/**
 * Generate URL for OpenUI5 samples
 */
export function generateOpenUi5SampleUrl(options: SapUi5UrlOptions): string | null {
  const generator = new SapUi5UrlGenerator('/openui5-samples', options.config);
  return generator.generateUrl(options);
}

/**
 * Main dispatcher for UI5-related URL generation
 */
export function generateUi5UrlForLibrary(options: SapUi5UrlOptions): string | null {
  const generator = new SapUi5UrlGenerator(options.libraryId, options.config);
  return generator.generateUrl(options);
}

