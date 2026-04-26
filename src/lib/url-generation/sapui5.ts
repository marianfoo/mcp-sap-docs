/**
 * URL generation for SAPUI5 documentation sources
 * Handles SAPUI5 guides, API docs, and samples
 */

import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';
import { DocUrlConfig } from '../metadata.js';
import { readSourceContentSync } from '../sourceContent.js';

export interface SapUi5UrlOptions {
  relFile: string;
  content: string;
  config: DocUrlConfig;
  libraryId: string;
}

const OPENUI5_SAMPLE_ENTITY_CACHE = new Map<string, Map<string, string>>();

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
    if (/^(?:index|README)\.md$/i.test(context.relFile)) {
      return this.extractFirstLinkedTopicUrl(context) || this.config.baseUrl;
    }

    // SAPUI5 docs often have topic IDs in frontmatter
    const topicId = context.frontmatter.id || context.frontmatter.topic;
    if (topicId) {
      return `${this.config.baseUrl}/#/topic/${topicId}`;
    }

    // SAPUI5 docs use loio/copy HTML comments for topic identifiers.
    const loioMatch = context.content?.match(/<!--\s*(?:loio|copy)([a-f0-9]{32})\s*-->/i);
    if (loioMatch) {
      return `${this.config.baseUrl}/#/topic/${loioMatch[1]}`;
    }
    
    // Extract topic ID from filename if following SAPUI5 conventions (UUID pattern)
    const topicIdMatch = context.relFile.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (topicIdMatch) {
      return `${this.config.baseUrl}/#/topic/${topicIdMatch[1]}`;
    }
    
    return this.config.baseUrl;
  }

  private extractFirstLinkedTopicUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    const linkMatch = context.content.match(/\[[^\]]+\]\(([^)#?]+\.md)(?:#[^)]+)?\)/i);
    if (!linkMatch) {
      return null;
    }

    const linkedRelFile = linkMatch[1].replace(/^\.\//, '');
    const linkedContent = readSourceContentSync(this.libraryId, linkedRelFile);
    if (!linkedContent) {
      return null;
    }

    const linkedFrontmatter = this.parseFrontmatter(linkedContent);
    const linkedTopicId = linkedFrontmatter.id || linkedFrontmatter.topic;
    if (linkedTopicId) {
      return `${this.config.baseUrl}/#/topic/${linkedTopicId}`;
    }

    const loioMatch = linkedContent.match(/<!--\s*(?:loio|copy)([a-f0-9]{32})\s*-->/i);
    return loioMatch ? `${this.config.baseUrl}/#/topic/${loioMatch[1]}` : null;
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
    const pathMatch = context.relFile.match(/(?:^|\/)src\/(sap\/.+)\.js$/);
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
    const sampleInfo = this.extractOpenUi5SampleInfo(context.relFile, context.content);
    if (sampleInfo) {
      return `${this.config.baseUrl}/#/entity/${sampleInfo.entityId}/sample/${sampleInfo.sampleId}`;
    }
    
    return null; // Let fallback handle it
  }

  private extractOpenUi5SampleInfo(relFile: string, content: string): { sampleId: string; entityId: string } | null {
    const sampleMatch = relFile.match(/^(sap\.[^/]+)\/test\/(sap(?:\/[^/]+)+)\/demokit\/sample\/(.+)$/);
    if (!sampleMatch) {
      return null;
    }

    const [, , namespacePath, sampleRelativePath] = sampleMatch;
    const namespace = namespacePath.replace(/\//g, '.');
    const pathParts = sampleRelativePath.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return null;
    }

    const sampleRoot = pathParts[0];
    const sampleRootPrefix = relFile.slice(0, relFile.length - sampleRelativePath.length);
    const manifestRelFile = `${sampleRootPrefix}${sampleRoot}/manifest.json`;
    const manifestContent = relFile.endsWith('/manifest.json')
      ? content
      : readSourceContentSync(this.libraryId, manifestRelFile);
    const sampleId = this.extractSampleIdFromContent(manifestContent || content) || `${namespace}.sample.${sampleRoot}`;
    const entityId = this.findOpenUi5SampleEntity(relFile, sampleId) || this.fallbackOpenUi5SampleEntity(namespace, sampleId, sampleRoot);

    return { sampleId, entityId };
  }

  private extractSampleIdFromContent(content: string): string | null {
    const manifestMatch = content.match(/"id"\s*:\s*"(sap\.[^"]+\.sample\.[^"]+)"/);
    if (manifestMatch) {
      return manifestMatch[1];
    }

    const componentMatch = content.match(/\.extend\(\s*["'](sap\.[^"']+\.sample\.[^"']+)\.Component["']/);
    if (componentMatch) {
      return componentMatch[1];
    }

    return null;
  }

  private findOpenUi5SampleEntity(relFile: string, sampleId: string): string | null {
    const docuIndexRelFile = this.getOpenUi5DocuIndexRelFile(relFile);
    if (!docuIndexRelFile) {
      return null;
    }

    const sampleEntityMap = this.getOpenUi5SampleEntityMap(docuIndexRelFile);
    return sampleEntityMap.get(sampleId) || null;
  }

  private getOpenUi5DocuIndexRelFile(relFile: string): string | null {
    const sampleMatch = relFile.match(/^(sap\.[^/]+)\/test\/(sap(?:\/[^/]+)+)\/demokit\/sample\//);
    if (!sampleMatch) {
      return null;
    }

    const [, libraryFolder, namespacePath] = sampleMatch;
    return `${libraryFolder}/test/${namespacePath}/demokit/docuindex.json`;
  }

  private getOpenUi5SampleEntityMap(docuIndexRelFile: string): Map<string, string> {
    const cacheKey = `${this.libraryId}:${docuIndexRelFile}`;
    const cached = OPENUI5_SAMPLE_ENTITY_CACHE.get(cacheKey);
    if (cached) {
      return cached;
    }

    const sampleEntityMap = new Map<string, string>();
    const docuIndexContent = readSourceContentSync(this.libraryId, docuIndexRelFile);
    if (!docuIndexContent) {
      OPENUI5_SAMPLE_ENTITY_CACHE.set(cacheKey, sampleEntityMap);
      return sampleEntityMap;
    }

    try {
      const docuIndex = JSON.parse(docuIndexContent);
      const entities = docuIndex?.explored?.entities;
      if (Array.isArray(entities)) {
        for (const entity of entities) {
          if (typeof entity?.id !== 'string' || !Array.isArray(entity.samples)) {
            continue;
          }

          for (const sampleId of entity.samples) {
            if (typeof sampleId === 'string') {
              sampleEntityMap.set(sampleId, entity.id);
            }
          }
        }
      }
    } catch {
      // Ignore malformed local metadata and use the generic fallback.
    }

    OPENUI5_SAMPLE_ENTITY_CACHE.set(cacheKey, sampleEntityMap);
    return sampleEntityMap;
  }

  private fallbackOpenUi5SampleEntity(namespace: string, sampleId: string, sampleRoot: string): string {
    const sampleRouteName = sampleId.split('.sample.')[1]?.split('.')[0] || sampleRoot;
    return `${namespace}.${sampleRouteName}`;
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
