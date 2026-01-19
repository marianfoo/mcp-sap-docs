/**
 * URL Generator for ABAP Keyword Documentation
 * Maps individual .md files to official SAP ABAP documentation URLs
 * 
 * Supports two library types:
 * - Standard ABAP (on-premise, full syntax): /abap-docs-standard
 * - ABAP Cloud (BTP, restricted syntax): /abap-docs-cloud
 * 
 * URL Schema: /doc/{index}/version/en-US/{filename}.html
 * Note: File extension is .html (not .htm), consistent with SAP's current URL structure
 * 
 * Version info:
 * - Standard ABAP: abapdocu_latest_index_htm/latest - on-premise latest (content is currently 7.58)
 * - ABAP Cloud: abapdocu_cp_index_htm/CLOUD - BTP version (9.16+, 8.1x for S/4HANA 2025)
 */

import { BaseUrlGenerator } from './BaseUrlGenerator.js';
import { DocUrlConfig } from '../metadata.js';

// Base URLs for ABAP documentation (without trailing slash)
// Schema: https://help.sap.com/doc/{index}/{version}/en-US/{filename}.html
const ABAP_BASE_URLS = {
  // Standard ABAP - on-premise, full syntax (latest on-premise version, currently 7.58)
  // URL: https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENABAP.html
  standard: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US',
  
  // ABAP Cloud - BTP, restricted syntax (9.16+ for public cloud, 8.1x for S/4HANA 2025)
  // URL: https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/ABENABAP.html
  cloud: 'https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US'
} as const;

/**
 * ABAP URL Generator for official SAP documentation
 * Converts .md filenames to proper help.sap.com URLs
 * 
 * Two libraries are supported:
 * - /abap-docs-standard: Standard ABAP (on-premise, default)
 * - /abap-docs-cloud: ABAP Cloud (BTP, restricted syntax)
 */
export class AbapUrlGenerator extends BaseUrlGenerator {
  
  generateSourceSpecificUrl(context: any): string | null {
    
    // Extract filename without extension
    let filename = context.relFile.replace(/\.md$/, '');
    
    // Remove 'md/' prefix if present (from sources/abap-docs/docs/standard/md/)
    filename = filename.replace(/^md\//, '');
    
    // Convert .md filename back to .html for SAP documentation
    const htmlFile = filename + '.html';
    
    // Determine library type (standard vs cloud) - default to standard
    const libraryType = this.extractLibraryType();
    
    // Build SAP help URL
    const baseUrl = ABAP_BASE_URLS[libraryType];
    const fullUrl = `${baseUrl}/${htmlFile}`;
    
    // Add anchor if provided
    return context.anchor ? `${fullUrl}#${context.anchor}` : fullUrl;
  }
  
  /**
   * Extract ABAP library type from library ID
   * Returns 'standard' or 'cloud', defaults to 'standard'
   */
  private extractLibraryType(): 'standard' | 'cloud' {
    const libraryId = this.libraryId || '';
    
    // Check for cloud library
    if (libraryId.includes('cloud')) {
      return 'cloud';
    }
    
    // Default to standard (on-premise)
    return 'standard';
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
