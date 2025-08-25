/**
 * URL generation for SAP Cloud SDK documentation sources
 * Handles JavaScript, Java, and AI SDK variants
 */

import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';
import { DocUrlConfig } from '../metadata.js';

export interface CloudSdkUrlOptions {
  relFile: string;
  content: string;
  config: DocUrlConfig;
  libraryId: string;
}

/**
 * Cloud SDK URL Generator
 * Handles JavaScript, Java, and AI SDK variants with specialized URL generation
 */
export class CloudSdkUrlGenerator extends BaseUrlGenerator {
  
  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    const identifier = this.getIdentifierFromFrontmatter(context.frontmatter);
    
    // Use frontmatter ID if available (preferred method)
    if (identifier) {
      // Special handling for AI SDK variants
      if (this.isAiSdk()) {
        return this.buildAiSdkUrl(context.relFile, identifier);
      } else {
        return this.buildUrl(this.config.baseUrl, context.section, identifier);
      }
    }
    
    return null;
  }
  
  /**
   * Check if this is an AI SDK variant
   */
  private isAiSdk(): boolean {
    return this.libraryId.includes('-ai-');
  }
  
  /**
   * Build AI SDK specific URL with proper section handling
   */
  private buildAiSdkUrl(relFile: string, identifier: string): string {
    // Extract section from the file path for AI SDK
    if (this.isInDirectory(relFile, 'langchain')) {
      return this.buildUrl(this.config.baseUrl, 'langchain', identifier);
    } else if (this.isInDirectory(relFile, 'getting-started')) {
      return this.buildUrl(this.config.baseUrl, 'getting-started', identifier);
    } else if (this.isInDirectory(relFile, 'examples')) {
      return this.buildUrl(this.config.baseUrl, 'examples', identifier);
    }
    
    // Default behavior for other sections
    const section = this.extractSection(relFile);
    return this.buildUrl(this.config.baseUrl, section, identifier);
  }
  
  /**
   * Override section extraction for Cloud SDK specific patterns
   */
  protected extractSection(relFile: string): string {
    // Check for Cloud SDK specific patterns first
    if (this.isInDirectory(relFile, 'environments')) {
      return '/environments/';
    } else if (this.isInDirectory(relFile, 'getting-started')) {
      return '/getting-started/';
    }
    
    // Use base implementation for common patterns
    return super.extractSection(relFile);
  }
}

// Convenience functions for backward compatibility and external use

/**
 * Generate URL for Cloud SDK documentation using the class-based approach
 */
export function generateCloudSdkUrl(options: CloudSdkUrlOptions): string | null {
  const generator = new CloudSdkUrlGenerator(options.libraryId, options.config);
  return generator.generateUrl(options);
}

/**
 * Generate AI SDK URL (now handled by the main generator)
 */
export function generateCloudSdkAiUrl(options: CloudSdkUrlOptions): string | null {
  return generateCloudSdkUrl(options);
}

/**
 * Main URL generator dispatcher for all Cloud SDK variants
 */
export function generateCloudSdkUrlForLibrary(options: CloudSdkUrlOptions): string | null {
  return generateCloudSdkUrl(options);
}

