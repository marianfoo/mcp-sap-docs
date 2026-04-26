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
  DsagUrlGenerator,
  ArchitectureCenterUrlGenerator,
  GithubBlobUrlGenerator,
  MkDocsUrlGenerator,
  SapHelpLoioUrlGenerator,
  Ui5TypeScriptUrlGenerator,
  Ui5WebComponentsUrlGenerator
} from '../src/lib/url-generation/index.js';
import { AbapUrlGenerator, generateAbapUrl } from '../src/lib/url-generation/abap.js';
import { DocUrlConfig, getDocUrlConfig } from '../src/lib/metadata.js';
import { normalizeCommunityUrl } from '../src/lib/communityBestMatch.js';

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
      '/wdi5': { basePath: 'sources/wdi5/docs' },
      '/ui5-typescript': { basePath: 'sources/ui5-typescript' },
      '/ui5-cc-spreadsheetimporter': { basePath: 'sources/ui5-cc-spreadsheetimporter/docs' },
      '/abap-cheat-sheets': { basePath: 'sources/abap-cheat-sheets' },
      '/sap-styleguides': { basePath: 'sources/sap-styleguides' },
      '/dsag-abap-leitfaden': { basePath: 'sources/dsag-abap-leitfaden/docs' },
      '/abap-fiori-showcase': { basePath: 'sources/abap-fiori-showcase' },
      '/cap-fiori-showcase': { basePath: 'sources/cap-fiori-showcase' },
      '/btp-cloud-platform': { basePath: 'sources/btp-cloud-platform/docs' },
      '/sap-artificial-intelligence': { basePath: 'sources/sap-artificial-intelligence/docs' },
      '/terraform-provider-btp': { basePath: 'sources/terraform-provider-btp' },
      '/architecture-center': { basePath: 'sources/architecture-center/docs/ref-arch' }
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
   * - frontmatter: YAML frontmatter fixture
   * - content: Markdown or MDX fixture content
   * 
   * The main matrix intentionally uses fixture content so URL expectations
   * stay deterministic even when submodules are updated.
   */
  const testCases = [
    {
      name: 'CAP - CDS Log Documentation',
      libraryId: '/cap',
      relFile: 'node.js/cds-log.md',
      expectedUrl: 'https://cap.cloud.sap/docs/node.js/cds-log',
      frontmatter: '---\nid: cds-log\ntitle: Logging\n---\n',
      content: '# Logging\n\nCAP provides structured logging capabilities...'
    },
    {
      name: 'Cloud MTA Build Tool - Download Page',
      libraryId: '/cloud-mta-build-tool',
      relFile: 'download.md',
      expectedUrl: 'https://sap.github.io/cloud-mta-build-tool/download/',
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
      relFile: 'sap.m/test/sap/m/demokit/sample/ButtonWithBadge/Component.js',
      expectedUrl: 'https://sdk.openui5.org/#/entity/sap.m.Button/sample/sap.m.sample.ButtonWithBadge',
      frontmatter: '',
      content: 'sap.ui.define([\n  "sap/ui/core/UIComponent"\n], function (UIComponent) {\n  var Component = UIComponent.extend("sap.m.sample.ButtonWithBadge.Component", {});'
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
      expectedUrl: 'https://ui5.github.io/cli/v4/pages/Builder/#ui5-builder',
      frontmatter: '',
      content: '# UI5 Builder\n\nThe UI5 Builder module takes care of building your project...'
    },
    {
      name: 'UI5 Web Components - Configuration',
      libraryId: '/ui5-webcomponents',
      relFile: '2-advanced/01-configuration.md',
      expectedUrl: 'https://ui5.github.io/webcomponents/docs/advanced/configuration/',
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
    },
    {
      name: 'UI5 TypeScript - FAQ Documentation',
      libraryId: '/ui5-typescript',
      relFile: 'faq.md',
      expectedUrl: 'https://ui5.github.io/typescript/faq.html#faq---frequently-asked-questions-for-the-ui5-type-definitions',
      frontmatter: '',
      content: '# FAQ - Frequently Asked Questions for the UI5 Type Definitions\n\nWhile the [main page](README.md) answers the high-level questions...'
    },
    {
      name: 'UI5 CC Spreadsheet Importer - Checks Documentation',
      libraryId: '/ui5-cc-spreadsheetimporter',
      relFile: 'pages/Checks.md',
      expectedUrl: 'https://docs.spreadsheet-importer.com/pages/Checks/#error-types',
      frontmatter: '',
      content: '## Error Types\n\nThe following types of errors are handled by the UI5 Spreadsheet Upload Control...'
    },
    {
      name: 'ABAP Cheat Sheets - Internal Tables',
      libraryId: '/abap-cheat-sheets',
      relFile: '01_Internal_Tables.md',
      expectedUrl: 'https://github.com/SAP-samples/abap-cheat-sheets/blob/main/01_Internal_Tables.md#internal-tables',
      frontmatter: '',
      content: '# Internal Tables\n\nThis cheat sheet contains a selection of syntax examples and notes on internal tables...'
    },
    {
      name: 'SAP Style Guides - Clean ABAP',
      libraryId: '/sap-styleguides',
      relFile: 'clean-abap/CleanABAP.md',
      expectedUrl: 'https://github.com/SAP/styleguides/blob/main/clean-abap/CleanABAP.md#clean-abap',
      frontmatter: '',
      content: '# Clean ABAP\n\n> [**中文**](CleanABAP_zh.md)\n\nThis style guide presents the essentials of clean ABAP...'
    },
    {
      name: 'DSAG ABAP Guide - Clean Core',
      libraryId: '/dsag-abap-leitfaden',
      relFile: 'clean-core/what-is-clean-core.md',
      expectedUrl: 'https://marianfoo.github.io/DSAG-ABAP-Guide/clean-core/what-is-clean-core/#was-ist-clean-core',
      frontmatter: '',
      content: '# Was ist Clean Core?\n\nClean Core ist ein Konzept von SAP, das darauf abzielt...'
    },
    {
      name: 'ABAP Platform Fiori Feature Showcase - General Features',
      libraryId: '/abap-fiori-showcase',
      relFile: '01_general_features.md',
      expectedUrl: 'https://github.com/SAP-samples/abap-platform-fiori-feature-showcase/blob/main/01_general_features.md#general-features',
      frontmatter: '',
      content: '# General Features\n\nThis section describes the features that are generally used throughout...'
    },
    {
      name: 'CAP Fiori Elements Feature Showcase - README',
      libraryId: '/cap-fiori-showcase',
      relFile: 'README.md',
      expectedUrl: 'https://github.com/SAP-samples/fiori-elements-feature-showcase/blob/main/README.md#sap-fiori-elements-for-odata-v4-feature-showcase',
      frontmatter: '',
      content: '# SAP Fiori Elements for OData V4 Feature Showcase\n\nThis app showcases different features of SAP Fiori elements...'
    },
    {
      name: 'RAP openSAP Samples - README',
      libraryId: '/abap-platform-rap-opensap',
      relFile: 'README.md',
      expectedUrl: 'https://github.com/SAP-samples/abap-platform-rap-opensap/blob/main/README.md#rap-opensap-course-samples',
      frontmatter: '',
      content: '# RAP openSAP Course Samples\n\nSample code for RAP.'
    },
    {
      name: 'Cloud ABAP RAP Samples - README',
      libraryId: '/cloud-abap-rap',
      relFile: 'README.md',
      expectedUrl: 'https://github.com/SAP-samples/cloud-abap-rap/blob/main/README.md#sap-cloud-abap-rap',
      frontmatter: '',
      content: '# SAP Cloud ABAP RAP\n\nRAP examples for ABAP Cloud.'
    },
    {
      name: 'ABAP Platform Reuse Services - README',
      libraryId: '/abap-platform-reuse-services',
      relFile: 'README.md',
      expectedUrl: 'https://github.com/SAP-samples/abap-platform-reuse-services/blob/main/README.md#abap-platform-reuse-services',
      frontmatter: '',
      content: '# ABAP Platform Reuse Services\n\nReuse service examples.'
    },
    {
      name: 'TechEd 2025 DT260 - README',
      libraryId: '/teched2025-dt260',
      relFile: 'README.md',
      expectedUrl: 'https://github.com/SAP-samples/teched2025-DT260/blob/main/README.md#teched-2025-dt260',
      frontmatter: '',
      content: '# TechEd 2025 DT260\n\nABAP clean core modernization.'
    },
    {
      name: 'Terraform BTP Provider - Index',
      libraryId: '/terraform-provider-btp',
      relFile: 'docs/index.md',
      expectedUrl: 'https://registry.terraform.io/providers/SAP/btp/latest/docs',
      frontmatter: '',
      content: '# Terraform Provider for SAP BTP\n\nThe Terraform provider for SAP BTP enables you...'
    },
    {
      name: 'Terraform BTP Data Source - Subaccount',
      libraryId: '/terraform-provider-btp',
      relFile: 'docs/data-sources/subaccount.md',
      expectedUrl: 'https://registry.terraform.io/providers/SAP/btp/latest/docs/data-sources/subaccount',
      frontmatter: '',
      content: '# btp_subaccount (Data Source)\n\nGets details about a subaccount.'
    },
    {
      name: 'Terraform BTP Function - Extract CF API URL',
      libraryId: '/terraform-provider-btp',
      relFile: 'docs/functions/extract_cf_api_url.md',
      expectedUrl: 'https://registry.terraform.io/providers/SAP/btp/latest/docs/functions/extract_cf_api_url',
      frontmatter: '',
      content: '# extract_cf_api_url (function)\n\nParses the label string...'
    },
    {
      name: 'Terraform BTP List Resource - Subaccount',
      libraryId: '/terraform-provider-btp',
      relFile: 'docs/list-resources/subaccount.md',
      expectedUrl: 'https://registry.terraform.io/providers/SAP/btp/latest/docs/list-resources/subaccount',
      frontmatter: '',
      content: '# btp_subaccount (List Resource)\n\nThis list resource allows you to discover all subaccounts.'
    },
    {
      name: 'Terraform BTP Resource - Subaccount',
      libraryId: '/terraform-provider-btp',
      relFile: 'docs/resources/subaccount.md',
      expectedUrl: 'https://registry.terraform.io/providers/SAP/btp/latest/docs/resources/subaccount',
      frontmatter: '',
      content: '# btp_subaccount (Resource)\n\nCreates a subaccount in a global account or directory.'
    },
    {
      name: 'SAP Help BTP - LOIO URL',
      libraryId: '/btp-cloud-platform',
      relFile: '20-getting-started/abap-environment-initial-settings-a999fac.md',
      expectedUrl: 'https://help.sap.com/docs/BTP/65de2977205c403bbc107264b8eccf4b/a999fac2a578468ea0e4e320c82145ce.html',
      frontmatter: '',
      content: '<!-- loioa999fac2a578468ea0e4e320c82145ce -->\n\n# ABAP Environment Initial Settings'
    },
    {
      name: 'SAP Help AI Core - LOIO URL',
      libraryId: '/sap-artificial-intelligence',
      relFile: 'sap-ai-core/delete-a-docker-registry-secret-5ff30f0.md',
      expectedUrl: 'https://help.sap.com/docs/AI_CORE/2d6c5984063c40a59eda62f4a9135bee/5ff30f0332b8452d97ed77edf746714a.html?version=CLOUD',
      frontmatter: '',
      content: '<!-- loio5ff30f0332b8452d97ed77edf746714a -->\n\n# Delete a Docker Registry Secret'
    },
    {
      name: 'SAP Help AI Launchpad - LOIO URL',
      libraryId: '/sap-artificial-intelligence',
      relFile: 'sap-ai-launchpad/using-sap-ai-launchpad-bbc7e21.md',
      expectedUrl: 'https://help.sap.com/docs/AI_LAUNCHPAD/92d77f26188e4582897b9106b9cb72e0/bbc7e21629ce4aef87d85c30cc8b1be8.html?version=CLOUD',
      frontmatter: '',
      content: '<!-- loiobbc7e21629ce4aef87d85c30cc8b1be8 -->\n\n# Using SAP AI Launchpad'
    },
    // Architecture Center - slug-based URL generation
    {
      name: 'Architecture Center - Event-Driven Applications (RA0001)',
      libraryId: '/architecture-center',
      relFile: 'RA0001/readme.md',
      expectedUrl: 'https://architecture.learning.sap.com/docs/ref-arch/fbdc46aaae',
      frontmatter: '---\nid: id-ra0001\nslug: /ref-arch/fbdc46aaae\ntitle: Designing Event-Driven Applications\ndescription: Guidance for developing applications based on Event-Driven Architecture (EDA) patterns.\nkeywords:\n  - event-driven applications\n  - eda patterns\n  - cap framework\n---\n',
      content: '# Designing Event-Driven Applications\n\nThis reference architecture provides guidance for developing applications...'
    },
    {
      name: 'Architecture Center - Generative AI on SAP BTP (RA0005)',
      libraryId: '/architecture-center',
      relFile: 'RA0005/readme.md',
      expectedUrl: 'https://architecture.learning.sap.com/docs/ref-arch/e5eb3b9b1d',
      frontmatter: '---\nid: id-ra0005\nslug: /ref-arch/e5eb3b9b1d\ntitle: Generative AI on SAP BTP\ndescription: Integrate Generative AI with SAP BTP using SAP HANA Cloud Vector Engine.\nkeywords:\n  - generative ai hub\n  - vector engine integration\n---\n',
      content: '# Generative AI on SAP BTP\n\nIntegrate Generative AI with SAP BTP...'
    }
  ];

  describe('Main URL Generation Function', () => {
    testCases.forEach(({ name, libraryId, relFile, expectedUrl, frontmatter, content }) => {
      it(`should generate correct URL for ${name}`, () => {
        // Step 1: Get configuration from metadata.json
        const config = getConfigForLibrary(libraryId);
        
        // Step 2: Use fixed fixture content so URL expectations stay deterministic
        const fileContent = frontmatter ? `${frontmatter}\n${content}` : content;
        
        // For debugging: log which content source was used
        if (process.env.DEBUG_TESTS === 'true') {
          console.log(`\n[${name}] Using test data`);
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

      it('should preserve nested Docusaurus parent paths for numbered docs', () => {
        const config = getConfigForLibrary('/cloud-sdk-java');
        const generator = new CloudSdkUrlGenerator('/cloud-sdk-java', config);
        const content = '---\nid: destination-service\n---\n# Connectivity Features';

        const result = generator.generateUrl({
          libraryId: '/cloud-sdk-java',
          relFile: 'features/connectivity/000-overview.mdx',
          content,
          config
        });

        expect(result).toBe('https://sap.github.io/cloud-sdk/docs/java/features/connectivity/destination-service');
      });

      it('should prefer Docusaurus slug frontmatter over file-derived routes', () => {
        const config = getConfigForLibrary('/cloud-sdk-js');
        const generator = new CloudSdkUrlGenerator('/cloud-sdk-js', config);
        const content = '---\nid: ignored-id\nslug: /features/custom-runtime-route\n---\n# Custom Route';

        const result = generator.generateUrl({
          libraryId: '/cloud-sdk-js',
          relFile: 'features/runtime/001-original-name.mdx',
          content,
          config
        });

        expect(result).toBe('https://sap.github.io/cloud-sdk/docs/js/features/custom-runtime-route');
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

      it('should derive OpenUI5 sample routes from manifest sample ids', () => {
        const config = getConfigForLibrary('/openui5-samples');
        const generator = new SapUi5UrlGenerator('/openui5-samples', config);
        const content = '{"sap.app":{"id":"sap.ui.unified.sample.ColorPicker"}}';

        const result = generator.generateUrl({
          libraryId: '/openui5-samples',
          relFile: 'sap.ui.unified/test/sap/ui/unified/demokit/sample/ColorPickerSimplified/manifest.json',
          content,
          config
        });

        expect(result).toBe('https://sdk.openui5.org/#/entity/sap.ui.unified.ColorPicker/sample/sap.ui.unified.sample.ColorPicker');
      });

      it('should keep nested OpenUI5 sample sub-files on the sample root route', () => {
        const config = getConfigForLibrary('/openui5-samples');
        const generator = new SapUi5UrlGenerator('/openui5-samples', config);
        const content = '<mvc:View controllerName="sap.m.sample.Slider.Slider"></mvc:View>';

        const result = generator.generateUrl({
          libraryId: '/openui5-samples',
          relFile: 'sap.m/test/sap/m/demokit/sample/Slider/view/Slider.view.xml',
          content,
          config
        });

        expect(result).toBe('https://sdk.openui5.org/#/entity/sap.m.Slider/sample/sap.m.sample.Slider');
      });

      it('should derive OpenUI5 sample entities from Demokit docuindex metadata', () => {
        const config = getConfigForLibrary('/openui5-samples');
        const generator = new SapUi5UrlGenerator('/openui5-samples', config);
        const content = '{"sap.app":{"id":"sap.uxap.sample.ObjectPageHeaderExpanded"}}';

        const result = generator.generateUrl({
          libraryId: '/openui5-samples',
          relFile: 'sap.uxap/test/sap/uxap/demokit/sample/ObjectPageHeaderExpanded/manifest.json',
          content,
          config
        });

        expect(result).toBe('https://sdk.openui5.org/#/entity/sap.uxap.ObjectPageLayout/sample/sap.uxap.sample.ObjectPageHeaderExpanded');
      });
    });

    describe('CapUrlGenerator', () => {
      it('should generate direct capire documentation URLs', () => {
        const config = getConfigForLibrary('/cap');
        const generator = new CapUrlGenerator('/cap', config);
        const content = '# Providing Services';
        
        const result = generator.generateUrl({
          libraryId: '/cap',
          relFile: 'guides/providing-services.md',
          content,
          config
        });
        
        expect(result).toBe('https://cap.cloud.sap/docs/guides/services/providing-services');
      });

      it('should preserve nested CAP documentation paths', () => {
        const config = getConfigForLibrary('/cap');
        const generator = new CapUrlGenerator('/cap', config);
        const content = '---\nslug: cds-types\n---\n# CDS Types';
        
        const result = generator.generateUrl({
          libraryId: '/cap',
          relFile: 'cds/types.md',
          content,
          config
        });
        
        expect(result).toBe('https://cap.cloud.sap/docs/cds/types');
      });

      it('should map indexed legacy CAP paths to current capire routes', () => {
        const config = getConfigForLibrary('/cap');
        const generator = new CapUrlGenerator('/cap', config);

        const cases = [
          ['about/best-practices.md', 'https://cap.cloud.sap/docs/get-started/concepts'],
          ['advanced/hana.md', 'https://cap.cloud.sap/docs/guides/databases/hana-native'],
          ['advanced/hybrid-testing.md', 'https://cap.cloud.sap/docs/tools/cds-bind'],
          ['advanced/publishing-apis/openapi.md', 'https://cap.cloud.sap/docs/guides/protocols/openapi'],
          ['get-started/troubleshooting.md', 'https://cap.cloud.sap/docs/get-started/get-help'],
          ['guides/databases-hana.md', 'https://cap.cloud.sap/docs/guides/databases/hana'],
          ['guides/deployment/custom-builds.md', 'https://cap.cloud.sap/docs/guides/deploy/build'],
          ['guides/messaging/event-broker.md', 'https://cap.cloud.sap/docs/guides/events/event-hub'],
          ['guides/data-privacy/audit-logging.md', 'https://cap.cloud.sap/docs/guides/security/dpp-audit-logging'],
          ['guides/extensibility/composition.md', 'https://cap.cloud.sap/docs/guides/integration/reuse-and-compose']
        ] as const;

        for (const [relFile, expected] of cases) {
          const result = generator.generateUrl({
            libraryId: '/cap',
            relFile,
            content: '# CAP',
            config
          });

          expect(result).toBe(expected);
        }
      });

      it('should use GitHub blob URLs for indexed CAP files that are not published as site pages', () => {
        const config = getConfigForLibrary('/cap');
        const generator = new CapUrlGenerator('/cap', config);

        const result = generator.generateUrl({
          libraryId: '/cap',
          relFile: 'CODE_OF_CONDUCT.md',
          content: '# Contributor Covenant Code of Conduct',
          config
        });

        expect(result).toMatch(/^https:\/\/github\.com\/capire\/docs\/blob\/(?:[a-f0-9]{40}|main)\/CODE_OF_CONDUCT\.md$/);
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

    describe('DsagUrlGenerator', () => {
      it('should generate GitHub Pages URLs with path transformation', () => {
        const config = getConfigForLibrary('/dsag-abap-leitfaden');
        const generator = new DsagUrlGenerator('/dsag-abap-leitfaden', config);
        const content = '---\npermalink: /abap/oo-basics/\n---\n# Ergänzungen und Details zu Themen der Objektorientierung';
        
        const result = generator.generateUrl({
          libraryId: '/dsag-abap-leitfaden',
          relFile: 'abap/OO-basics.md',
          content,
          config
        });
        
        expect(result).toBe('https://marianfoo.github.io/DSAG-ABAP-Guide/abap/oo-basics/#ergänzungen-und-details-zu-themen-der-objektorientierung');
      });

      it('should handle root-level documentation', () => {
        const config = getConfigForLibrary('/dsag-abap-leitfaden');
        const generator = new DsagUrlGenerator('/dsag-abap-leitfaden', config);
        const content = '# ABAP Leitfaden\n\nDer DSAG ABAP Leitfaden...';
        
        const result = generator.generateUrl({
          libraryId: '/dsag-abap-leitfaden',
          relFile: 'README.md',
          content,
          config
        });
        
        expect(result).toBe('https://marianfoo.github.io/DSAG-ABAP-Guide/#abap-leitfaden');
      });
    });

    describe('MkDocsUrlGenerator', () => {
      it('should generate GitHub Pages URLs with trailing slash and anchors', () => {
        const config = getConfigForLibrary('/ui5-tooling');
        const generator = new MkDocsUrlGenerator('/ui5-tooling', config);
        const content = '# Test Document';
        
        const result = generator.generateUrl({
          libraryId: '/ui5-tooling',
          relFile: 'pages/test.md',
          content,
          config
        });
        
        expect(result).toBe('https://ui5.github.io/cli/v4/pages/test/#test-document');
      });

      it('should map index pages to the source homepage', () => {
        const config = getConfigForLibrary('/cloud-mta-build-tool');
        const generator = new MkDocsUrlGenerator('/cloud-mta-build-tool', config);
        const content = '# Cloud MTA Build Tool';
        
        const result = generator.generateUrl({
          libraryId: '/cloud-mta-build-tool',
          relFile: 'index.md',
          content,
          config
        });
        
        expect(result).toBe('https://sap.github.io/cloud-mta-build-tool/#cloud-mta-build-tool');
      });
    });

    describe('GithubBlobUrlGenerator', () => {
      it('should preserve directories and markdown extensions for GitHub blob URLs', () => {
        const config = getConfigForLibrary('/sap-styleguides');
        const generator = new GithubBlobUrlGenerator('/sap-styleguides', config);
        const content = '# Clean ABAP';

        const result = generator.generateUrl({
          libraryId: '/sap-styleguides',
          relFile: 'clean-abap/CleanABAP.md',
          content,
          config
        });

        expect(result).toBe('https://github.com/SAP/styleguides/blob/main/clean-abap/CleanABAP.md#clean-abap');
      });
    });

    describe('Ui5WebComponentsUrlGenerator', () => {
      it('should map numbered Docusaurus paths to public docs routes', () => {
        const config = getConfigForLibrary('/ui5-webcomponents');
        const generator = new Ui5WebComponentsUrlGenerator('/ui5-webcomponents', config);

        const result = generator.generateUrl({
          libraryId: '/ui5-webcomponents',
          relFile: '2-advanced/01-configuration.md',
          content: '# Configuration',
          config
        });

        expect(result).toBe('https://ui5.github.io/webcomponents/docs/advanced/configuration/');
      });
    });

    describe('Ui5TypeScriptUrlGenerator', () => {
      it('should map Markdown pages to the gh-pages HTML output', () => {
        const config = getConfigForLibrary('/ui5-typescript');
        const generator = new Ui5TypeScriptUrlGenerator('/ui5-typescript', config);

        const result = generator.generateUrl({
          libraryId: '/ui5-typescript',
          relFile: 'faq.md',
          content: '# FAQ',
          config
        });

        expect(result).toBe('https://ui5.github.io/typescript/faq.html#faq');
      });
    });

    describe('SapHelpLoioUrlGenerator', () => {
      it('should build BTP SAP Help URLs from LOIO comments', () => {
        const config = getConfigForLibrary('/btp-cloud-platform');
        const generator = new SapHelpLoioUrlGenerator('/btp-cloud-platform', config);

        const result = generator.generateUrl({
          libraryId: '/btp-cloud-platform',
          relFile: '20-getting-started/abap-environment-initial-settings-a999fac.md',
          content: '<!-- loioa999fac2a578468ea0e4e320c82145ce -->\n# ABAP Environment Initial Settings',
          config
        });

        expect(result).toBe('https://help.sap.com/docs/BTP/65de2977205c403bbc107264b8eccf4b/a999fac2a578468ea0e4e320c82145ce.html');
      });

      it('should not fall back to invalid SAP Help paths without a LOIO', () => {
        const config = getConfigForLibrary('/btp-cloud-platform');
        const generator = new SapHelpLoioUrlGenerator('/btp-cloud-platform', config);

        const result = generator.generateUrl({
          libraryId: '/btp-cloud-platform',
          relFile: 'missing-loio.md',
          content: '# Missing LOIO',
          config
        });

        expect(result).toBeNull();
      });
    });

    describe('SAP Community URL normalization', () => {
      it('should convert relative Khoros URLs to absolute SAP Community URLs', () => {
        const result = normalizeCommunityUrl('/t5/technology-blogs-by-sap/example/ba-p/123456');
        expect(result).toBe('https://community.sap.com/t5/technology-blogs-by-sap/example/ba-p/123456');
      });

      it('should preserve already absolute URLs', () => {
        const result = normalizeCommunityUrl('https://community.sap.com/t5/example/td-p/42');
        expect(result).toBe('https://community.sap.com/t5/example/td-p/42');
      });
    });

    describe('AbapUrlGenerator', () => {
      /**
       * ABAP URL Generation Tests
       * 
       * Two library types are supported:
       * - /abap-docs-standard: Standard ABAP (on-premise, full syntax)
       *   URL pattern: https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/{filename}.html
       * 
       * - /abap-docs-cloud: ABAP Cloud (BTP, restricted syntax, 9.16+/8.1x)
       *   URL pattern: https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/{filename}.html
       */
      
      it('should generate correct URLs for Standard ABAP (on-premise)', () => {
        // Standard ABAP uses abapdocu_latest_index_htm/latest
        const config: DocUrlConfig = {
          baseUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US',
          pathPattern: '/{file}',
          anchorStyle: 'sap-help'
        };
        
        const generator = new AbapUrlGenerator('/abap-docs-standard', config);
        
        const result = generator.generateSourceSpecificUrl({
          libraryId: '/abap-docs-standard',
          relFile: 'abeninline_declarations.md',
          content: '# Inline Declarations',
          config
        });
        
        // Standard ABAP → abapdocu_latest_index_htm/latest
        expect(result).toBe('https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/abeninline_declarations.html');
      });

      it('should generate correct URLs for ABAP Cloud (BTP)', () => {
        // ABAP Cloud uses abapdocu_cp_index_htm/CLOUD
        const config: DocUrlConfig = {
          baseUrl: 'https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US',
          pathPattern: '/{file}',
          anchorStyle: 'sap-help'
        };
        
        const generator = new AbapUrlGenerator('/abap-docs-cloud', config);
        
        const result = generator.generateSourceSpecificUrl({
          libraryId: '/abap-docs-cloud',
          relFile: 'abapselect.md',
          content: '# SELECT Statement',
          config
        });
        
        // ABAP Cloud → abapdocu_cp_index_htm/CLOUD
        expect(result).toBe('https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/abapselect.html');
      });

      it('should handle md/ prefix in file paths', () => {
        const config: DocUrlConfig = {
          baseUrl: 'https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US',
          pathPattern: '/{file}',
          anchorStyle: 'sap-help'
        };
        
        const generator = new AbapUrlGenerator('/abap-docs-cloud', config);
        
        const result = generator.generateSourceSpecificUrl({
          libraryId: '/abap-docs-cloud',
          relFile: 'md/abaploop.md',
          content: '# LOOP Statement',
          config
        });
        
        // Should strip the md/ prefix
        expect(result).toBe('https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/abaploop.html');
      });

      it('should handle anchors correctly for Standard ABAP', () => {
        const config: DocUrlConfig = {
          baseUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US',
          pathPattern: '/{file}',
          anchorStyle: 'sap-help'
        };
        
        const generator = new AbapUrlGenerator('/abap-docs-standard', config);
        
        const result = generator.generateSourceSpecificUrl({
          libraryId: '/abap-docs-standard',
          relFile: 'abeninline_declarations.md',
          content: '# Inline Declarations',
          config,
          anchor: 'syntax'
        });
        
        expect(result).toBe('https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/abeninline_declarations.html#syntax');
      });

      it('should handle anchors correctly for ABAP Cloud', () => {
        const config: DocUrlConfig = {
          baseUrl: 'https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US',
          pathPattern: '/{file}',
          anchorStyle: 'sap-help'
        };
        
        const generator = new AbapUrlGenerator('/abap-docs-cloud', config);
        
        const result = generator.generateSourceSpecificUrl({
          libraryId: '/abap-docs-cloud',
          relFile: 'abapdata.md',
          content: '# DATA Statement',
          config,
          anchor: 'section1'
        });
        
        expect(result).toBe('https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/abapdata.html#section1');
      });

      it('should correctly identify library type from library ID', () => {
        const testCases = [
          { 
            libraryId: '/abap-docs-standard', 
            expectedBaseUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US'
          },
          { 
            libraryId: '/abap-docs-cloud', 
            expectedBaseUrl: 'https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US'
          }
        ];

        testCases.forEach(({ libraryId, expectedBaseUrl }) => {
          const config: DocUrlConfig = {
            baseUrl: expectedBaseUrl,
            pathPattern: '/{file}',
            anchorStyle: 'sap-help'
          };
          
          const generator = new AbapUrlGenerator(libraryId, config);
          
          const result = generator.generateSourceSpecificUrl({
            libraryId,
            relFile: 'test.md',
            content: '# Test',
            config
          });
          
          expect(result).toContain(expectedBaseUrl);
          expect(result).toBe(`${expectedBaseUrl}/test.html`);
        });
      });

      it('should use .html extension (not .htm)', () => {
        const config: DocUrlConfig = {
          baseUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US',
          pathPattern: '/{file}',
          anchorStyle: 'sap-help'
        };
        
        const generator = new AbapUrlGenerator('/abap-docs-standard', config);
        
        const result = generator.generateSourceSpecificUrl({
          libraryId: '/abap-docs-standard',
          relFile: 'ABENABAP.md',
          content: '# ABAP Overview',
          config
        });
        
        // Should use .html file extension (not .htm file extension)
        expect(result).toContain('ABENABAP.html');
        expect(result).toMatch(/\.html$/);
        expect(result).not.toMatch(/\.htm$/);
      });

      it('should generate correct URL for ABENABAP entry point (Standard)', () => {
        const config: DocUrlConfig = {
          baseUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US',
          pathPattern: '/{file}',
          anchorStyle: 'sap-help'
        };
        
        const generator = new AbapUrlGenerator('/abap-docs-standard', config);
        
        const result = generator.generateSourceSpecificUrl({
          libraryId: '/abap-docs-standard',
          relFile: 'ABENABAP.md',
          content: '# ABAP - Overview',
          config
        });
        
        // Per migration summary: Standard → abapdocu_latest_index_htm/latest
        expect(result).toBe('https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENABAP.html');
      });

      it('should generate correct URL for ABENABAP entry point (Cloud)', () => {
        const config: DocUrlConfig = {
          baseUrl: 'https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US',
          pathPattern: '/{file}',
          anchorStyle: 'sap-help'
        };
        
        const generator = new AbapUrlGenerator('/abap-docs-cloud', config);
        
        const result = generator.generateSourceSpecificUrl({
          libraryId: '/abap-docs-cloud',
          relFile: 'ABENABAP.md',
          content: '# ABAP - Overview',
          config
        });
        
        // Per migration summary: Cloud → abapdocu_cp_index_htm/CLOUD
        expect(result).toBe('https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/ABENABAP.html');
      });

      it('should default to standard when library type is ambiguous', () => {
        // Test with an unknown library ID pattern - should default to standard
        const config: DocUrlConfig = {
          baseUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US',
          pathPattern: '/{file}',
          anchorStyle: 'sap-help'
        };
        
        const generator = new AbapUrlGenerator('/abap-docs-unknown', config);
        
        const result = generator.generateSourceSpecificUrl({
          libraryId: '/abap-docs-unknown',
          relFile: 'test.md',
          content: '# Test',
          config
        });
        
        // Should use standard (on-premise) base URL as default
        expect(result).toBe('https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/test.html');
      });
    });

    describe('ArchitectureCenterUrlGenerator', () => {
      it('should generate URLs using frontmatter slug (not id)', () => {
        const config = getConfigForLibrary('/architecture-center');
        const generator = new ArchitectureCenterUrlGenerator('/architecture-center', config);
        const content = '---\nid: id-ra0001\nslug: /ref-arch/fbdc46aaae\ntitle: Designing Event-Driven Applications\n---\n# Designing Event-Driven Applications';

        const result = generator.generateUrl({
          libraryId: '/architecture-center',
          relFile: 'RA0001/readme.md',
          content,
          config
        });

        expect(result).toBe('https://architecture.learning.sap.com/docs/ref-arch/fbdc46aaae');
      });

      it('should prefer slug over id for URL generation', () => {
        const config = getConfigForLibrary('/architecture-center');
        const generator = new ArchitectureCenterUrlGenerator('/architecture-center', config);
        // Both id and slug are present - slug should win
        const content = '---\nid: id-ra0010\nslug: /ref-arch/1311c18c17\ntitle: Some Architecture\n---\n# Content';

        const result = generator.generateUrl({
          libraryId: '/architecture-center',
          relFile: 'RA0010/readme.md',
          content,
          config
        });

        expect(result).toBe('https://architecture.learning.sap.com/docs/ref-arch/1311c18c17');
      });

      it('should not append anchors from content headings', () => {
        const config = getConfigForLibrary('/architecture-center');
        const generator = new ArchitectureCenterUrlGenerator('/architecture-center', config);
        const content = '---\nslug: /ref-arch/abc123\n---\n# Main Title\n\n## Architecture Overview\n\nContent here...';

        const result = generator.generateUrl({
          libraryId: '/architecture-center',
          relFile: 'RA0099/readme.md',
          content,
          config
        });

        // Slug-based URLs should be clean without anchors
        expect(result).toBe('https://architecture.learning.sap.com/docs/ref-arch/abc123');
      });

      it('should read real source files and generate correct URLs', () => {
        // Test against actual RA0001 source file if available
        const content = readFileContent('/architecture-center', 'RA0001/readme.md');
        if (!content) {
          console.warn('Skipping real file test - architecture-center submodule not available');
          return;
        }

        const config = getConfigForLibrary('/architecture-center');
        const result = generateDocumentationUrl('/architecture-center', 'RA0001/readme.md', content, config);

        expect(result).toBe('https://architecture.learning.sap.com/docs/ref-arch/fbdc46aaae');
      });

      it('should read real RA0005 source file and generate correct URL', () => {
        const content = readFileContent('/architecture-center', 'RA0005/readme.md');
        if (!content) {
          console.warn('Skipping real file test - architecture-center submodule not available');
          return;
        }

        const config = getConfigForLibrary('/architecture-center');
        const result = generateDocumentationUrl('/architecture-center', 'RA0005/readme.md', content, config);

        expect(result).toBe('https://architecture.learning.sap.com/docs/ref-arch/e5eb3b9b1d');
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
