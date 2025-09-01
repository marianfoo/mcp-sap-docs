/**
 * URL Generator for ABAP Keyword Documentation
 * Maps individual .md files to official SAP ABAP documentation URLs
 */

import { BaseUrlGenerator } from './BaseUrlGenerator.js';
import { DocUrlConfig } from '../metadata.js';

/**
 * ABAP URL Generator for official SAP documentation
 * Converts .md filenames to proper help.sap.com URLs
 */
export class AbapUrlGenerator extends BaseUrlGenerator {
  
  generateSourceSpecificUrl(context: any): string | null {
    
    // Extract filename without extension
    let filename = context.relFile.replace(/\.md$/, '');
    
    // Remove 'md/' prefix if present (from sources/abap-docs/docs/7.58/md/)
    filename = filename.replace(/^md\//, '');
    
    // Convert .md filename back to .htm for SAP documentation
    const htmFile = filename + '.htm';
    
    // Get version from config or default to 7.58
    const version = this.extractVersion() || '7.58';
    
    // Build SAP help URL
    const baseUrl = this.getAbapBaseUrl(version);
    const fullUrl = `${baseUrl}/${htmFile}`;
    
    // Add anchor if provided
    return context.anchor ? `${fullUrl}#${context.anchor}` : fullUrl;
  }
  
  /**
   * Extract ABAP version from config
   */
  private extractVersion(): string | null {
    // Check if version is in the library ID or path pattern
    const pathPattern = this.config.pathPattern || '';
    const libraryId = this.libraryId || '';
    
    // Try to extract from library ID or path pattern
    const versionMatch = (libraryId + pathPattern).match(/\/(\d+\.\d+)\//);
    return versionMatch ? versionMatch[1] : null;
  }
  
  /**
   * Get base URL for ABAP documentation based on version
   */
  private getAbapBaseUrl(version: string): string {
    if (version === 'latest') {
      return 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US';
    }
    
    // Convert version format: 7.58 → 758
    const versionCode = version.replace('.', '');
    return `https://help.sap.com/doc/abapdocu_${versionCode}_index_htm/${version}/en-US`;
  }
}

/**
 * Generate ABAP documentation URL
 */
export function generateAbapUrl(libraryId: string, relativeFile: string, config: DocUrlConfig, anchor?: string): string | null {
  const generator = new AbapUrlGenerator(libraryId, config);
  return generator.generateSourceSpecificUrl({ 
    relFile: relativeFile, 
    content: '', 
    config, 
    libraryId,
    anchor 
  });
}
