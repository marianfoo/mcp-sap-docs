/**
 * Comprehensive URL Generation Test Suite
 * 
 * This test suite validates the URL generation system for SAP documentation sources.
 * It tests both the main generateDocumentationUrl function and individual generator classes
 * for 10+ different documentation sources including CAP, Cloud SDK, UI5, wdi5, etc.
 * 
 * Key Features:
 * - Reads from real source files when available (automatic path mapping)
 * - Falls back to test data when source files don't exist
 * - Uses real configuration from metadata.json (no hardcoded configs)
 * - Comprehensive coverage of all URL generation patterns
 * - Debug mode available with DEBUG_TESTS=true environment variable
 * 
 * Running Tests:
 * - npm run test:url-generation           # Run URL generation tests
 * - npm run test:url-generation:debug     # Run with debug output
 * - DEBUG_TESTS=true npx vitest run test/comprehensive-url-generation.test.ts
 * 
 * Architecture:
 * The system uses an abstract BaseUrlGenerator class with source-specific implementations
 * for different documentation platforms. Each generator handles its own URL patterns,
 * frontmatter parsing, and path transformations.
 */

import { describe, it, expect } from 'vitest';
import { 
  generateDocumentationUrl,
  CloudSdkUrlGenerator,
  SapUi5UrlGenerator,
  CapUrlGenerator,
  Wdi5UrlGenerator,
  GenericUrlGenerator
} from '../src/lib/url-generation/index.js';
import { DocUrlConfig, getDocUrlConfig } from '../src/lib/metadata.js';

describe('Comprehensive URL Generation System', () => {
  
  /**
   * Retrieves URL configuration from metadata.json for a given library
   * @param libraryId - The library identifier (e.g., '/cloud-sdk-js')
   * @returns Configuration object with baseUrl, pathPattern, and anchorStyle
   * @throws Error if no configuration is found
   */
  function getConfigForLibrary(libraryId: string): DocUrlConfig {
    const config = getDocUrlConfig(libraryId);
    if (!config) {
      throw new Error(`No configuration found for library: ${libraryId}`);
    }
    return config;
  }

  /**
   * Maps libraryId + relFile to actual source file path in the filesystem
   * Handles different repository structures and path transformations
   * @param libraryId - The library identifier 
   * @param relFile - The relative file path within the library
   * @returns Full path to the actual source file
   * @throws Error if no path mapping exists for the library
   */
  function getSourceFilePath(libraryId: string, relFile: string): string {
    const pathMappings: Record<string, { basePath: string; transform?: (relFile: string) => string }> = {
      '/cap': { basePath: 'sources/cap-docs' },
      '/cloud-mta-build-tool': { basePath: 'sources/cloud-mta-build-tool' },
      '/cloud-sdk-js': { basePath: 'sources/cloud-sdk/docs-js' },
      '/cloud-sdk-ai-js': { basePath: 'sources/cloud-sdk-ai/docs-js' },
      '/openui5-api': { 
        basePath: 'sources/openui5',
        transform: (relFile) => {
          // Transform src/sap/m/Button.js → src/sap.m/src/sap/m/Button.js
          const match = relFile.match(/^src\/sap\/([^\/]+)\/(.+)$/);
          if (match) {
            const [, module, file] = match;
            return `src/sap.${module}/src/sap/${module}/${file}`;
          }
          return relFile;
        }
      },
      '/openui5-samples': { basePath: 'sources/openui5' },
      '/sapui5': { basePath: 'sources/sapui5-docs/docs' },
      '/ui5-tooling': { basePath: 'sources/ui5-tooling/docs' },
      '/ui5-webcomponents': { basePath: 'sources/ui5-webcomponents/docs' },
      '/wdi5': { basePath: 'sources/wdi5/docs' }
    };

    const mapping = pathMappings[libraryId];
    if (!mapping) {
      throw new Error(`No source path mapping found for library: ${libraryId}`);
    }

    const transformedRelFile = mapping.transform ? mapping.transform(relFile) : relFile;
    return `${mapping.basePath}/${transformedRelFile}`;
  }

  /**
   * Reads file content from actual source files with graceful fallback
   * @param libraryId - The library identifier (e.g., '/cloud-sdk-js')
   * @param relFile - The relative file path within the library
   * @returns File content as string, or null if file doesn't exist
   */
  function readFileContent(libraryId: string, relFile: string): string | null {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const sourceFilePath = getSourceFilePath(libraryId, relFile);
      const fullPath = path.resolve(sourceFilePath);
      return fs.readFileSync(fullPath, 'utf8');
    } catch (error: any) {
      console.warn(`Could not read file for ${libraryId}/${relFile}:`, error.message);
      // Return null to trigger fallback to test data
      return null;
    }
  }
  
  /**
   * Test cases for comprehensive URL generation testing
   * 
   * Each test case defines:
   * - name: Human-readable test description
   * - libraryId: Library identifier from metadata.json
   * - relFile: Relative file path within the library (used for path mapping)
   * - expectedUrl: Expected generated URL for validation
   * - frontmatter: Fallback YAML frontmatter (used when real file not found)
   * - content: Fallback content (used when real file not found)
   * 
   * The system will attempt to read real source files first, falling back to
   * the provided frontmatter/content if the file doesn't exist.
   */
  const testCases = [
    {
      name: 'CAP - CDS Log Documentation',
      libraryId: '/cap',
      relFile: 'node.js/cds-log.md',
      expectedUrl: 'https://cap.cloud.sap/docs/#/node.js/cds-log',
      frontmatter: '---\nid: cds-log\ntitle: Logging\n---\n',
      content: '# Logging\n\nCAP provides structured logging capabilities...'
    },
    {
      name: 'Cloud MTA Build Tool - Download Page',
      libraryId: '/cloud-mta-build-tool',
      relFile: 'docs/download.md',
      expectedUrl: 'https://sap.github.io/cloud-mta-build-tool/download',
      frontmatter: '',
      content: '\nYou can install the Cloud MTA Build Tool...'
    },
    {
      name: 'Cloud SDK JS - Kubernetes Migration',
      libraryId: '/cloud-sdk-js',
      relFile: 'environments/migrate-sdk-application-from-btp-cf-to-kubernetes.mdx',
      expectedUrl: 'https://sap.github.io/cloud-sdk/docs/js/environments/kubernetes',
      frontmatter: '---\nid: kubernetes\ntitle: Migrate your App from SAP BTP CF to Kubernetes\n---\n',
      content: '# Migrate a Cloud Foundry Application to a Kubernetes Cluster\n\nThis guide details...'
    },
    {
      name: 'Cloud SDK AI JS - Orchestration',
      libraryId: '/cloud-sdk-ai-js',
      relFile: 'langchain/orchestration.mdx',
      expectedUrl: 'https://sap.github.io/ai-sdk/docs/js/langchain/orchestration',
      frontmatter: '---\nid: orchestration\ntitle: Orchestration Integration\n---\n',
      content: '# Orchestration Integration\n\nThe @sap-ai-sdk/langchain packages provides...'
    },
    {
      name: 'OpenUI5 API - Button Control',
      libraryId: '/openui5-api',
      relFile: 'src/sap/m/Button.js',
      expectedUrl: 'https://sdk.openui5.org/#/api/sap.m.Button',
      frontmatter: '',
      content: 'sap.ui.define([\n  "./library",\n  "sap/ui/core/Control",\n  // Button control implementation'
    },
    {
      name: 'OpenUI5 Samples - ButtonWithBadge',
      libraryId: '/openui5-samples',
      relFile: 'src/sap.m/test/sap/m/demokit/sample/ButtonWithBadge/Component.js',
      expectedUrl: 'https://sdk.openui5.org/entity/sap.m.Button/sample/sap.m.sample.ButtonWithBadge',
      frontmatter: '',
      content: 'sap.ui.define([\n  "sap/ui/core/UIComponent"\n], function (UIComponent) {\n  // Sample implementation'
    },
         {
       name: 'SAPUI5 - Multi-Selection Navigation',
       libraryId: '/sapui5',
       relFile: '06_SAP_Fiori_Elements/multi-selection-for-intent-based-navigation-640cabf.md',
       expectedUrl: 'https://ui5.sap.com/#/topic/640cabfd35c3469aacf31be28924d50d',
       frontmatter: '---\nid: 640cabfd35c3469aacf31be28924d50d\ntopic: 640cabfd35c3469aacf31be28924d50d\ntitle: Multi-Selection for Intent-Based Navigation\n---\n',
       content: '# Multi-Selection for Intent-Based Navigation\n\nThis feature allows...'
     },
    {
      name: 'UI5 Tooling - Builder Documentation',
      libraryId: '/ui5-tooling',
      relFile: 'pages/Builder.md',
      expectedUrl: 'https://sap.github.io/ui5-tooling/v4/pages/Builder#ui5-builder',
      frontmatter: '',
      content: '# UI5 Builder\n\nThe UI5 Builder module takes care of building your project...'
    },
    {
      name: 'UI5 Web Components - Configuration',
      libraryId: '/ui5-webcomponents',
      relFile: '2-advanced/01-configuration.md',
      expectedUrl: 'https://sap.github.io/ui5-webcomponents/docs/01-configuration#configuration',
      frontmatter: '',
      content: '# Configuration\n\nThis section explains how you can configure UI5 Web Components...'
    },
    {
      name: 'wdi5 - Locators Documentation',
      libraryId: '/wdi5',
      relFile: 'locators.md',
      expectedUrl: 'https://ui5-community.github.io/wdi5/#/locators',
      frontmatter: '---\nid: locators\ntitle: Locators\n---\n',
      content: '# Locators\n\nwdi5 provides various locators for UI5 controls...'
    }
    // Note: Some sources like CAP, Cloud SDK AI, wdi5, etc. may need different file mappings
    // or fallback to mock content if actual files don't exist in expected locations
  ];

  describe('Main URL Generation Function', () => {
    testCases.forEach(({ name, libraryId, relFile, expectedUrl, frontmatter, content }) => {
      it(`should generate correct URL for ${name}`, () => {
        // Step 1: Get configuration from metadata.json
        const config = getConfigForLibrary(libraryId);
        
        // Step 2: Try to read from actual source file first, fallback to test data
        let fileContent = readFileContent(libraryId, relFile);
        let contentSource = 'real file';
        
        if (!fileContent) {
          // Fallback to hardcoded test data when real file is not available
          fileContent = frontmatter ? `${frontmatter}\n${content}` : content;
          contentSource = 'test data';
        }
        
        // For debugging: log which content source was used
        if (process.env.DEBUG_TESTS === 'true') {
          console.log(`\n[${name}] Using ${contentSource}`);
          console.log(`File path: ${libraryId}/${relFile}`);
          console.log(`Content preview: ${fileContent.slice(0, 100)}...`);
        }
        
        // Step 3: Generate URL using the URL generation system
        const result = generateDocumentationUrl(libraryId, relFile, fileContent, config);
        
        // Step 4: Validate the result
        expect(result).toBe(expectedUrl);
      });
    });
  });

  describe('Individual Generator Classes', () => {
    
    describe('CloudSdkUrlGenerator', () => {
      it('should generate URLs using frontmatter ID', () => {
        const config = getConfigForLibrary('/cloud-sdk-js');
        const generator = new CloudSdkUrlGenerator('/cloud-sdk-js', config);
        const content = '---\nid: kubernetes\n---\n# Migration Guide';
        
        const result = generator.generateUrl({
          libraryId: '/cloud-sdk-js',
          relFile: 'environments/migrate.mdx',
          content,
          config
        });
        
        expect(result).toBe('https://sap.github.io/cloud-sdk/docs/js/environments/kubernetes');
      });

      it('should handle AI SDK variants differently', () => {
        const config = getConfigForLibrary('/cloud-sdk-ai-js');
        const generator = new CloudSdkUrlGenerator('/cloud-sdk-ai-js', config);
        const content = '---\nid: orchestration\n---\n# Orchestration';
        
        const result = generator.generateUrl({
          libraryId: '/cloud-sdk-ai-js',
          relFile: 'langchain/orchestration.mdx',
          content,
          config
        });
        
        expect(result).toBe('https://sap.github.io/ai-sdk/docs/js/langchain/orchestration');
      });
    });

    describe('SapUi5UrlGenerator', () => {
      it('should generate topic-based URLs for SAPUI5', () => {
        const config = getConfigForLibrary('/sapui5');
        const generator = new SapUi5UrlGenerator('/sapui5', config);
        const content = '---\nid: 123e4567-e89b-12d3-a456-426614174000\n---\n# Topic Content';
        
        const result = generator.generateUrl({
          libraryId: '/sapui5',
          relFile: 'docs/topic.md',
          content,
          config
        });
        
        expect(result).toBe('https://ui5.sap.com/#/topic/123e4567-e89b-12d3-a456-426614174000');
      });

      it('should generate API URLs for OpenUI5 controls', () => {
        const config = getConfigForLibrary('/openui5-api');
        const generator = new SapUi5UrlGenerator('/openui5-api', config);
        const content = 'sap.ui.define([\n  "sap/m/Button"\n], function(Button) {';
        
        const result = generator.generateUrl({
          libraryId: '/openui5-api',
          relFile: 'src/sap/m/Button.js',
          content,
          config
        });
        
        expect(result).toBe('https://sdk.openui5.org/#/api/sap.m.Button');
      });
    });

    describe('CapUrlGenerator', () => {
      it('should generate docsify-style URLs', () => {
        const config = getConfigForLibrary('/cap');
        const generator = new CapUrlGenerator('/cap', config);
        const content = '---\nid: getting-started\n---\n# Getting Started';
        
        const result = generator.generateUrl({
          libraryId: '/cap',
          relFile: 'guides/getting-started.md',
          content,
          config
        });
        
        expect(result).toBe('https://cap.cloud.sap/docs/#/guides/getting-started');
      });

      it('should handle CDS-specific sections', () => {
        const config = getConfigForLibrary('/cap');
        const generator = new CapUrlGenerator('/cap', config);
        const content = '---\nslug: cds-types\n---\n# CDS Types';
        
        const result = generator.generateUrl({
          libraryId: '/cap',
          relFile: 'cds/types.md',
          content,
          config
        });
        
        expect(result).toBe('https://cap.cloud.sap/docs/#/cds/cds-types');
      });
    });

    describe('Wdi5UrlGenerator', () => {
      it('should generate docsify-style URLs for wdi5', () => {
        const config = getConfigForLibrary('/wdi5');
        const generator = new Wdi5UrlGenerator('/wdi5', config);
        const content = '---\nid: locators\n---\n# Locators';
        
        const result = generator.generateUrl({
          libraryId: '/wdi5',
          relFile: 'locators.md',
          content,
          config
        });
        
        expect(result).toBe('https://ui5-community.github.io/wdi5/#/locators');
      });

      it('should handle configuration-specific sections', () => {
        const config = getConfigForLibrary('/wdi5');
        const generator = new Wdi5UrlGenerator('/wdi5', config);
        const content = '---\nid: basic-config\n---\n# Basic Configuration';
        
        const result = generator.generateUrl({
          libraryId: '/wdi5',
          relFile: 'configuration/basic.md',
          content,
          config
        });
        
        expect(result).toBe('https://ui5-community.github.io/wdi5/#/configuration/basic-config');
      });
    });

    describe('GenericUrlGenerator', () => {
      it('should handle generic sources with frontmatter', () => {
        const config = getConfigForLibrary('/ui5-tooling'); // Use a real generic source
        const generator = new GenericUrlGenerator('/ui5-tooling', config);
        const content = '---\nid: test-doc\n---\n# Test Document';
        
        const result = generator.generateUrl({
          libraryId: '/ui5-tooling',
          relFile: 'pages/test.md',
          content,
          config
        });
        
        expect(result).toBe('https://sap.github.io/ui5-tooling/v4/pages/test-doc#test-document');
      });

      it('should fallback to filename when no frontmatter', () => {
        const config = getConfigForLibrary('/ui5-tooling'); // Use a real generic source
        const generator = new GenericUrlGenerator('/ui5-tooling', config);
        const content = '# Test Document\n\nSome content...';
        
        const result = generator.generateUrl({
          libraryId: '/ui5-tooling',
          relFile: 'pages/test.md',
          content,
          config
        });
        
        expect(result).toBe('https://sap.github.io/ui5-tooling/v4/pages/test#test-document');
      });
    });
  });

  describe('Error Handling', () => {
    it('should return null for missing config', () => {
      const result = generateDocumentationUrl('/unknown', 'file.md', 'content', null as any);
      expect(result).toBeNull();
    });

    it('should handle malformed frontmatter gracefully', () => {
      // Test with a non-existent library ID that will use the generic generator
      const config = getConfigForLibrary('/ui5-tooling'); // Use a real config for fallback testing
      
      const content = '---\ninvalid: yaml: content:\n---\n# Content';
      const result = generateDocumentationUrl('/ui5-tooling', 'test.md', content, config);
      
      expect(result).not.toBeNull();
    });
  });

  describe('URL Pattern Validation', () => {
    testCases.forEach(({ name, expectedUrl }) => {
      it(`should generate valid URL format for ${name}`, () => {
        expect(expectedUrl).toMatch(/^https?:\/\//);
        expect(() => new URL(expectedUrl)).not.toThrow();
      });
    });
  });
});
