/**
 * Main entry point for URL generation across all documentation sources
 * Dispatches to source-specific generators based on library ID
 */

import { DocUrlConfig } from '../metadata.js';
import { CloudSdkUrlGenerator } from './cloud-sdk.js';
import { SapUi5UrlGenerator } from './sapui5.js';
import { CapUrlGenerator } from './cap.js';
import { Wdi5UrlGenerator } from './wdi5.js';
import { DsagUrlGenerator } from './dsag.js';
import { GenericUrlGenerator } from './GenericUrlGenerator.js';
import { BaseUrlGenerator } from './BaseUrlGenerator.js';

export interface UrlGenerationOptions {
  libraryId: string;
  relFile: string;
  content: string;
  config: DocUrlConfig;
}

/**
 * URL Generator Registry
 * Maps library IDs to their corresponding URL generator classes
 */
const URL_GENERATORS: Record<string, new (libraryId: string, config: DocUrlConfig) => BaseUrlGenerator> = {
  // Cloud SDK variants
  '/cloud-sdk-js': CloudSdkUrlGenerator,
  '/cloud-sdk-java': CloudSdkUrlGenerator,
  '/cloud-sdk-ai-js': CloudSdkUrlGenerator,
  '/cloud-sdk-ai-java': CloudSdkUrlGenerator,
  
  // UI5 variants
  '/sapui5': SapUi5UrlGenerator,
  '/openui5-api': SapUi5UrlGenerator,
  '/openui5-samples': SapUi5UrlGenerator,
  
  // CAP documentation
  '/cap': CapUrlGenerator,
  
  // wdi5 testing framework
  '/wdi5': Wdi5UrlGenerator,
  
  // DSAG ABAP Leitfaden with custom GitHub Pages URL pattern
  '/dsag-abap-leitfaden': DsagUrlGenerator,
  
  // Generic sources
  '/ui5-tooling': GenericUrlGenerator,
  '/cloud-mta-build-tool': GenericUrlGenerator,
  '/ui5-webcomponents': GenericUrlGenerator,
  '/ui5-typescript': GenericUrlGenerator,
  '/ui5-cc-spreadsheetimporter': GenericUrlGenerator,
  '/abap-cheat-sheets': GenericUrlGenerator,
  '/sap-styleguides': GenericUrlGenerator,
  '/abap-fiori-showcase': GenericUrlGenerator,
  '/cap-fiori-showcase': GenericUrlGenerator,
};

/**
 * Create URL generator for a given library ID
 */
function createUrlGenerator(libraryId: string, config: DocUrlConfig): BaseUrlGenerator {
  const GeneratorClass = URL_GENERATORS[libraryId];
  
  if (GeneratorClass) {
    return new GeneratorClass(libraryId, config);
  }
  
  // Fallback to generic generator for unknown sources
  console.log(`Using generic URL generator for unknown library: ${libraryId}`);
  return new GenericUrlGenerator(libraryId, config);
}

/**
 * Main URL generation function
 * Uses class-based generators for cleaner, more maintainable code
 * 
 * @param libraryId - The library/source identifier (e.g., '/cloud-sdk-js')
 * @param relFile - Relative file path within the source
 * @param content - File content for extracting metadata
 * @param config - URL configuration for this source
 * @returns Generated URL or null if generation fails
 */
export function generateDocumentationUrl(
  libraryId: string, 
  relFile: string, 
  content: string,
  config: DocUrlConfig
): string | null {
  if (!config) {
    console.warn(`No URL config available for library: ${libraryId}`);
    return null;
  }

  try {
    const generator = createUrlGenerator(libraryId, config);
    const url = generator.generateUrl({
      libraryId,
      relFile,
      content,
      config
    });
    
    return url;
  } catch (error) {
    console.warn(`Error generating URL for ${libraryId}:`, error);
    return null;
  }
}

// Re-export utilities and generator classes for external use
export { parseFrontmatter, detectContentSection, extractSectionFromPath, buildUrl, extractLibraryIdFromPath, extractRelativeFileFromPath, formatSearchResult } from './utils.js';
export { BaseUrlGenerator } from './BaseUrlGenerator.js';
export type { UrlGenerationContext } from './BaseUrlGenerator.js';

// Re-export generator classes
export { CloudSdkUrlGenerator } from './cloud-sdk.js';
export { SapUi5UrlGenerator } from './sapui5.js';
export { CapUrlGenerator } from './cap.js';
export { Wdi5UrlGenerator } from './wdi5.js';
export { DsagUrlGenerator } from './dsag.js';
export { GenericUrlGenerator } from './GenericUrlGenerator.js';

// Re-export convenience functions for backward compatibility
export { generateCloudSdkUrl, generateCloudSdkAiUrl, generateCloudSdkUrlForLibrary } from './cloud-sdk.js';
export { generateSapUi5Url, generateOpenUi5ApiUrl, generateOpenUi5SampleUrl, generateUi5UrlForLibrary } from './sapui5.js';
export { generateCapUrl, generateCapCdsUrl, generateCapTutorialUrl } from './cap.js';
export { generateWdi5Url, generateWdi5ConfigUrl, generateWdi5SelectorUrl } from './wdi5.js';
export { generateDsagUrl } from './dsag.js';
