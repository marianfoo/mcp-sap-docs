/**
 * Abstract base class for URL generation across documentation sources
 * Provides common functionality and standardized interface for all URL generators
 */

import { parseFrontmatter, extractSectionFromPath, buildUrl, detectContentSection, FrontmatterData } from './utils.js';
import { DocUrlConfig } from '../metadata.js';

export interface UrlGenerationContext {
  relFile: string;
  content: string;
  config: DocUrlConfig;
  libraryId: string;
}

export interface UrlGenerationResult {
  url: string | null;
  anchor?: string;
  section?: string;
  frontmatter?: FrontmatterData;
}

/**
 * Abstract base class for all URL generators
 * Provides common functionality while allowing source-specific customization
 */
export abstract class BaseUrlGenerator {
  protected readonly libraryId: string;
  protected readonly config: DocUrlConfig;

  constructor(libraryId: string, config: DocUrlConfig) {
    this.libraryId = libraryId;
    this.config = config;
  }

  /**
   * Main entry point for URL generation
   * Orchestrates the generation process using template method pattern
   */
  public generateUrl(context: UrlGenerationContext): string | null {
    try {
      const frontmatter = this.parseFrontmatter(context.content);
      const section = this.extractSection(context.relFile);
      const anchor = this.generateAnchor(context.content);

      // Try source-specific generation first
      let url = this.generateSourceSpecificUrl({
        ...context,
        frontmatter,
        section,
        anchor
      });

      // Fallback to generic generation if needed
      if (!url) {
        url = this.generateFallbackUrl({
          ...context,
          frontmatter,
          section,
          anchor
        });
      }

      return url;
    } catch (error) {
      console.warn(`Error generating URL for ${this.libraryId}:`, error);
      return null;
    }
  }

  /**
   * Source-specific URL generation logic
   * Must be implemented by each concrete generator
   */
  protected abstract generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null;

  /**
   * Generic fallback URL generation
   * Uses filename and config pattern as last resort
   */
  protected generateFallbackUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    // Extract just the filename without directory path to avoid duplication with pathPattern
    const fileName = context.relFile
      .replace(/\.mdx?$/, '')
      .replace(/\.html?$/, '')
      .replace(/.*\//, ''); // Remove directory path, keep only filename
    
    let urlPath = this.config.pathPattern.replace('{file}', fileName);
    
    // Add anchor if available
    if (context.anchor) {
      const separator = this.getSeparator();
      urlPath += separator + context.anchor;
    }
    
    return this.config.baseUrl + urlPath;
  }

  /**
   * Parse frontmatter from content
   * Can be overridden for source-specific parsing needs
   */
  protected parseFrontmatter(content: string): FrontmatterData {
    return parseFrontmatter(content);
  }

  /**
   * Extract section from file path
   * Can be overridden for source-specific section logic
   */
  protected extractSection(relFile: string): string {
    return extractSectionFromPath(relFile);
  }

  /**
   * Generate anchor from content
   * Can be overridden for source-specific anchor logic
   */
  protected generateAnchor(content: string): string | null {
    return detectContentSection(content, this.config.anchorStyle);
  }

  /**
   * Get URL separator based on anchor style
   */
  protected getSeparator(): string {
    return this.config.anchorStyle === 'docsify' ? '?id=' : '#';
  }

  /**
   * Build clean URL with proper path joining
   */
  protected buildUrl(baseUrl: string, ...pathSegments: string[]): string {
    return buildUrl(baseUrl, ...pathSegments);
  }

  /**
   * Get the identifier from frontmatter (id or slug)
   * Common pattern used by many sources
   */
  protected getIdentifierFromFrontmatter(frontmatter: FrontmatterData): string | null {
    return frontmatter.id || frontmatter.slug || null;
  }

  /**
   * Check if file is in specific directory
   */
  protected isInDirectory(relFile: string, directory: string): boolean {
    return relFile.includes(`${directory}/`);
  }

  /**
   * Extract filename without extension
   */
  protected getCleanFileName(relFile: string): string {
    return relFile
      .replace(/\.mdx?$/, '')
      .replace(/\.html?$/, '')
      .replace(/.*\//, ''); // Get last part after slash
  }

  /**
   * Build URL with section and identifier
   * Common pattern for many documentation sites
   */
  protected buildSectionUrl(section: string, identifier: string, anchor?: string | null): string {
    let url = this.buildUrl(this.config.baseUrl, section, identifier);
    
    if (anchor) {
      const separator = this.getSeparator();
      url += separator + anchor;
    }
    
    return url;
  }

  /**
   * Build docsify-style URL with # fragment
   */
  protected buildDocsifyUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${this.config.baseUrl}/#/${cleanPath}`;
  }
}
