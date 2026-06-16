/**
 * URL generation for SAP Cloud SDK documentation sources
 * Handles JavaScript, Java, and AI SDK variants
 */

import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';
import { DocUrlConfig } from '../metadata.js';
import { buildDocusaurusPath } from './docusaurus.js';

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
    const route = buildDocusaurusPath(context.relFile, context.frontmatter);
    return this.buildUrl(this.config.baseUrl, route);
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
