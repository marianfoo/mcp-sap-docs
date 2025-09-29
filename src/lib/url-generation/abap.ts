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
    
    // Convert .md filename back to .html for SAP documentation
    const htmlFile = filename + '.html';
    
    // Get version from config or default to latest (which now points to cloud version)
    const version = this.extractVersion() || 'latest';
    
    // Build SAP help URL
    const baseUrl = this.getAbapBaseUrl(version);
    const fullUrl = `${baseUrl}/${htmlFile}`;
    
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
    
    // Handle "latest" version explicitly
    if (libraryId.includes('latest') || pathPattern.includes('latest')) {
      return 'latest';
    }
    
    // Try to extract version patterns: 7.58, 9.16, 8.10, etc.
    const versionMatch = (libraryId + pathPattern).match(/\/(\d+\.\d+)\//);
    if (versionMatch) {
      return versionMatch[1];
    }
    
    // Try alternative patterns for cloud/new versions
    const cloudMatch = (libraryId + pathPattern).match(/-(latest|cloud|916|916\w*|81\w*)-/);
    if (cloudMatch) {
      const match = cloudMatch[1];
      if (match === 'latest' || match === 'cloud') return 'latest';
      if (match.startsWith('916')) return '9.16';
      if (match.startsWith('81')) return '8.10';
    }
    
    return null;
  }
  
  /**
   * Get base URL for ABAP documentation based on version
   */
  private getAbapBaseUrl(version: string): string {
    // Handle latest version - use the newest cloud version
    if (version === 'latest') {
      return 'https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US';
    }
    
    const versionNum = parseFloat(version);
    
    // Cloud versions (9.1x) - ABAP Cloud / SAP BTP
    if (versionNum >= 9.1) {
      return 'https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US';
    }
    
    // S/4HANA 2025 versions (8.1x)
    if (versionNum >= 8.1) {
      // Use the cloud pattern for S/4HANA 2025 as well, since they share the same doc structure
      return 'https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US';
    }
    
    // Legacy versions (7.x) - keep existing pattern
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
