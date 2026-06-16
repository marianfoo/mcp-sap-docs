import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateDocumentationUrl } from '../src/lib/url-generation/index.js';
import { getAllDocUrlConfigs, getDocUrlConfig } from '../src/lib/metadata.js';
import { normalizeCommunityUrl } from '../src/lib/communityBestMatch.js';
import { searchSapHelp } from '../src/lib/sapHelp.js';

type UrlCase = {
  libraryId: string;
  relFile: string;
  content: string;
  expectedUrl: string;
};

const fm = (id: string, title = 'Title') => `---\nid: ${id}\ntitle: ${title}\n---\n# ${title}`;
const loio = (id: string, title = 'Title') => `<!-- loio${id} -->\n\n# ${title}`;
const copyLoio = (id: string, title = 'Title') => `<!-- copy${id} -->\n\n# ${title}`;

const sourceUrlCases: UrlCase[] = [
  // SAPUI5
  {
    libraryId: '/sapui5',
    relFile: 'index.md',
    content: '# SAPUI5: UI Development Toolkit for HTML5\n\n- [SAPUI5: UI Development Toolkit for HTML5](sapui5-ui-development-toolkit-for-html5-95d113b.md)',
    expectedUrl: 'https://ui5.sap.com/#/topic/95d113be50ae40d5b0b562b84d715227'
  },
  {
    libraryId: '/sapui5',
    relFile: 'sapui5-ui-development-toolkit-for-html5-95d113b.md',
    content: loio('95d113be50ae40d5b0b562b84d715227', 'SAPUI5: UI Development Toolkit for HTML5'),
    expectedUrl: 'https://ui5.sap.com/#/topic/95d113be50ae40d5b0b562b84d715227'
  },
  {
    libraryId: '/sapui5',
    relFile: '02_Read-Me-First/read-me-first-167193c.md',
    content: loio('167193ced54c41c3961d7df3479d7bbe', 'Read Me First'),
    expectedUrl: 'https://ui5.sap.com/#/topic/167193ced54c41c3961d7df3479d7bbe'
  },
  {
    libraryId: '/sapui5',
    relFile: '02_Read-Me-First/supported-library-combinations-363cd16.md',
    content: loio('363cd16eba1f45babe3f661f321a7820', 'Supported Library Combinations'),
    expectedUrl: 'https://ui5.sap.com/#/topic/363cd16eba1f45babe3f661f321a7820'
  },
  {
    libraryId: '/sapui5',
    relFile: '04_Essentials/test-recorder-dac59fa.md',
    content: copyLoio('dac59fadd5f9419d986f74ba602c6d29', 'Test Recorder'),
    expectedUrl: 'https://ui5.sap.com/#/topic/dac59fadd5f9419d986f74ba602c6d29'
  },
  {
    libraryId: '/sapui5',
    relFile: '01_Whats-New/change-log-a6a78b7.md',
    content: loio('a6a78b7e104348b4bb94fb8bcf003480', 'Change Log'),
    expectedUrl: 'https://ui5.sap.com/#/topic/a6a78b7e104348b4bb94fb8bcf003480'
  },
  {
    libraryId: '/sapui5',
    relFile: '02_Read-Me-First/sapui5-vs-openui5-5982a97.md',
    content: loio('5982a9734748474aa8d4af9c3d8f31c0', 'SAPUI5 vs. OpenUI5'),
    expectedUrl: 'https://ui5.sap.com/#/topic/5982a9734748474aa8d4af9c3d8f31c0'
  },
  {
    libraryId: '/sapui5',
    relFile: '03_Get-Started/quickstart-tutorial-592f36f.md',
    content: loio('592f36fd077b45349a67dcb3efb46ab1', 'Quickstart Tutorial'),
    expectedUrl: 'https://ui5.sap.com/#/topic/592f36fd077b45349a67dcb3efb46ab1'
  },
  {
    libraryId: '/sapui5',
    relFile: '03_Get-Started/navigation-and-routing-tutorial-1b6dcd3.md',
    content: loio('1b6dcd39a6a74f528b27ddb22f15af0d', 'Navigation and Routing Tutorial'),
    expectedUrl: 'https://ui5.sap.com/#/topic/1b6dcd39a6a74f528b27ddb22f15af0d'
  },
  {
    libraryId: '/sapui5',
    relFile: '03_Get-Started/data-binding-tutorial-e531093.md',
    content: loio('e5310932a71f42daa41f3a6143efca9c', 'Data Binding Tutorial'),
    expectedUrl: 'https://ui5.sap.com/#/topic/e5310932a71f42daa41f3a6143efca9c'
  },
  {
    libraryId: '/sapui5',
    relFile: '04_Essentials/routing-and-navigation-3d18f20.md',
    content: loio('3d18f20bd2294228acb6910d8e8a5fb5', 'Routing and Navigation'),
    expectedUrl: 'https://ui5.sap.com/#/topic/3d18f20bd2294228acb6910d8e8a5fb5'
  },
  {
    libraryId: '/sapui5',
    relFile: '04_Essentials/model-view-controller-mvc-91f2334.md',
    content: loio('91f233476f4d1014b6dd926db0e91070', 'Model View Controller'),
    expectedUrl: 'https://ui5.sap.com/#/topic/91f233476f4d1014b6dd926db0e91070'
  },
  {
    libraryId: '/sapui5',
    relFile: '04_Essentials/xml-view-91f2928.md',
    content: loio('91f292806f4d1014b6dd926db0e91070', 'XML View'),
    expectedUrl: 'https://ui5.sap.com/#/topic/91f292806f4d1014b6dd926db0e91070'
  },
  {
    libraryId: '/sapui5',
    relFile: '04_Essentials/binding-syntax-e2e6f41.md',
    content: loio('e2e6f4127fe4450ab3cf1339c42ee832', 'Binding Syntax'),
    expectedUrl: 'https://ui5.sap.com/#/topic/e2e6f4127fe4450ab3cf1339c42ee832'
  },
  {
    libraryId: '/sapui5',
    relFile: '04_Essentials/odata-v4-model-5de13cf.md',
    content: loio('5de13cf4dd1f4a3480f7e2eaaee3f5b8', 'OData V4 Model'),
    expectedUrl: 'https://ui5.sap.com/#/topic/5de13cf4dd1f4a3480f7e2eaaee3f5b8'
  },

  // CAP
  {
    libraryId: '/cap',
    relFile: 'node.js/cds-log.md',
    content: '# Logging',
    expectedUrl: 'https://cap.cloud.sap/docs/node.js/cds-log'
  },
  {
    libraryId: '/cap',
    relFile: 'guides/providing-services.md',
    content: '# Providing Services',
    expectedUrl: 'https://cap.cloud.sap/docs/guides/services/providing-services'
  },
  {
    libraryId: '/cap',
    relFile: 'cds/cdl.md',
    content: '# CDL',
    expectedUrl: 'https://cap.cloud.sap/docs/cds/cdl'
  },
  {
    libraryId: '/cap',
    relFile: 'about/best-practices.md',
    content: '# Best Practices by CAP',
    expectedUrl: 'https://cap.cloud.sap/docs/get-started/concepts'
  },
  {
    libraryId: '/cap',
    relFile: 'advanced/hana.md',
    content: '# Using Native SAP HANA Artifacts',
    expectedUrl: 'https://cap.cloud.sap/docs/guides/databases/hana-native'
  },
  {
    libraryId: '/cap',
    relFile: 'get-started/troubleshooting.md',
    content: '# Troubleshooting',
    expectedUrl: 'https://cap.cloud.sap/docs/get-started/get-help'
  },

  // OpenUI5 API
  {
    libraryId: '/openui5-api',
    relFile: 'sap.m/src/sap/m/Button.js',
    content: 'sap.ui.define([]);',
    expectedUrl: 'https://sdk.openui5.org/#/api/sap.m.Button'
  },
  {
    libraryId: '/openui5-api',
    relFile: 'sap.ui.table/src/sap/ui/table/Table.js',
    content: 'sap.ui.define([]);',
    expectedUrl: 'https://sdk.openui5.org/#/api/sap.ui.table.Table'
  },
  {
    libraryId: '/openui5-api',
    relFile: 'sap.ui.core/src/sap/ui/core/mvc/Controller.js',
    content: 'sap.ui.define([]);',
    expectedUrl: 'https://sdk.openui5.org/#/api/sap.ui.core.mvc.Controller'
  },
  {
    libraryId: '/openui5-api',
    relFile: 'sap.m/src/sap/m/Dialog.js',
    content: 'sap.ui.define([]);',
    expectedUrl: 'https://sdk.openui5.org/#/api/sap.m.Dialog'
  },
  {
    libraryId: '/openui5-api',
    relFile: 'sap.m/src/sap/m/Input.js',
    content: 'sap.ui.define([]);',
    expectedUrl: 'https://sdk.openui5.org/#/api/sap.m.Input'
  },
  {
    libraryId: '/openui5-api',
    relFile: 'sap.ui.core/src/sap/ui/core/Component.js',
    content: 'sap.ui.define([]);',
    expectedUrl: 'https://sdk.openui5.org/#/api/sap.ui.core.Component'
  },
  {
    libraryId: '/openui5-api',
    relFile: 'sap.ui.core/src/sap/ui/model/json/JSONModel.js',
    content: 'sap.ui.define([]);',
    expectedUrl: 'https://sdk.openui5.org/#/api/sap.ui.model.json.JSONModel'
  },
  {
    libraryId: '/openui5-api',
    relFile: 'sap.ui.layout/src/sap/ui/layout/form/SimpleForm.js',
    content: 'sap.ui.define([]);',
    expectedUrl: 'https://sdk.openui5.org/#/api/sap.ui.layout.form.SimpleForm'
  },
  {
    libraryId: '/openui5-api',
    relFile: 'sap.uxap/src/sap/uxap/ObjectPageLayout.js',
    content: 'sap.ui.define([]);',
    expectedUrl: 'https://sdk.openui5.org/#/api/sap.uxap.ObjectPageLayout'
  },

  // OpenUI5 samples
  {
    libraryId: '/openui5-samples',
    relFile: 'sap.m/test/sap/m/demokit/sample/ButtonWithBadge/Component.js',
    content: 'UIComponent.extend("sap.m.sample.ButtonWithBadge.Component", {});',
    expectedUrl: 'https://sdk.openui5.org/#/entity/sap.m.Button/sample/sap.m.sample.ButtonWithBadge'
  },
  {
    libraryId: '/openui5-samples',
    relFile: 'sap.m/test/sap/m/demokit/sample/Slider/manifest.json',
    content: '{"sap.app":{"id":"sap.m.sample.Slider"}}',
    expectedUrl: 'https://sdk.openui5.org/#/entity/sap.m.Slider/sample/sap.m.sample.Slider'
  },
  {
    libraryId: '/openui5-samples',
    relFile: 'sap.m/test/sap/m/demokit/sample/Slider/view/Slider.view.xml',
    content: '<mvc:View controllerName="sap.m.sample.Slider.Slider"></mvc:View>',
    expectedUrl: 'https://sdk.openui5.org/#/entity/sap.m.Slider/sample/sap.m.sample.Slider'
  },
  {
    libraryId: '/openui5-samples',
    relFile: 'sap.ui.table/test/sap/ui/table/demokit/sample/Basic/manifest.json',
    content: '{"sap.app":{"id":"sap.ui.table.sample.Basic"}}',
    expectedUrl: 'https://sdk.openui5.org/#/entity/sap.ui.table.Table/sample/sap.ui.table.sample.Basic'
  },
  {
    libraryId: '/openui5-samples',
    relFile: 'sap.ui.unified/test/sap/ui/unified/demokit/sample/ColorPickerSimplified/manifest.json',
    content: '{"sap.app":{"id":"sap.ui.unified.sample.ColorPicker"}}',
    expectedUrl: 'https://sdk.openui5.org/#/entity/sap.ui.unified.ColorPicker/sample/sap.ui.unified.sample.ColorPicker'
  },
  {
    libraryId: '/openui5-samples',
    relFile: 'sap.uxap/test/sap/uxap/demokit/sample/ObjectPageHeaderExpanded/manifest.json',
    content: '{"sap.app":{"id":"sap.uxap.sample.ObjectPageHeaderExpanded"}}',
    expectedUrl: 'https://sdk.openui5.org/#/entity/sap.uxap.ObjectPageLayout/sample/sap.uxap.sample.ObjectPageHeaderExpanded'
  },
  {
    libraryId: '/openui5-samples',
    relFile: 'sap.f/test/sap/f/demokit/sample/DynamicPageFreeStyle/manifest.json',
    content: '{"sap.app":{"id":"sap.f.sample.DynamicPageFreeStyle"}}',
    expectedUrl: 'https://sdk.openui5.org/#/entity/sap.f.DynamicPage/sample/sap.f.sample.DynamicPageFreeStyle'
  },
  {
    libraryId: '/openui5-samples',
    relFile: 'sap.ui.layout/test/sap/ui/layout/demokit/sample/SimpleForm354/manifest.json',
    content: '{"sap.app":{"id":"sap.ui.layout.sample.SimpleForm354"}}',
    expectedUrl: 'https://sdk.openui5.org/#/entity/sap.ui.layout.form.SimpleForm/sample/sap.ui.layout.sample.SimpleForm354'
  },
  {
    libraryId: '/openui5-samples',
    relFile: 'sap.ui.core/test/sap/ui/core/demokit/sample/RoutingFullscreen/manifest.json',
    content: '{"sap.app":{"id":"sap.ui.core.sample.RoutingFullscreen"}}',
    expectedUrl: 'https://sdk.openui5.org/#/entity/sap.ui.core.routing.Router/sample/sap.ui.core.sample.RoutingFullscreen'
  },
  {
    libraryId: '/openui5-samples',
    relFile: 'sap.f/test/sap/f/demokit/sample/ShellBar/manifest.json',
    content: '{"sap.app":{"id":"sap.f.sample.ShellBar"}}',
    expectedUrl: 'https://sdk.openui5.org/#/entity/sap.f.ShellBar/sample/sap.f.sample.ShellBar'
  },

  // wdi5
  {
    libraryId: '/wdi5',
    relFile: 'README.md',
    content: '# wdi5',
    expectedUrl: 'https://ui5-community.github.io/wdi5/#/'
  },
  {
    libraryId: '/wdi5',
    relFile: 'locators.md',
    content: '# Locators',
    expectedUrl: 'https://ui5-community.github.io/wdi5/#/locators'
  },
  {
    libraryId: '/wdi5',
    relFile: 'configuration.md',
    content: '# Configuration',
    expectedUrl: 'https://ui5-community.github.io/wdi5/#/configuration'
  },

  // UI5 Tooling
  {
    libraryId: '/ui5-tooling',
    relFile: 'pages/Builder.md',
    content: '# UI5 Builder',
    expectedUrl: 'https://ui5.github.io/cli/v4/pages/Builder/#ui5-builder'
  },
  {
    libraryId: '/ui5-tooling',
    relFile: 'pages/Configuration.md',
    content: '# Configuration',
    expectedUrl: 'https://ui5.github.io/cli/v4/pages/Configuration/#configuration'
  },
  {
    libraryId: '/ui5-tooling',
    relFile: 'updates/migrate-v4.md',
    content: '# Migrate to v4',
    expectedUrl: 'https://ui5.github.io/cli/v4/updates/migrate-v4/#migrate-to-v4'
  },

  // Cloud MTA Build Tool
  {
    libraryId: '/cloud-mta-build-tool',
    relFile: 'download.md',
    content: '# Download',
    expectedUrl: 'https://sap.github.io/cloud-mta-build-tool/download/#download'
  },
  {
    libraryId: '/cloud-mta-build-tool',
    relFile: 'configuration.md',
    content: '# Configuration',
    expectedUrl: 'https://sap.github.io/cloud-mta-build-tool/configuration/#configuration'
  },
  {
    libraryId: '/cloud-mta-build-tool',
    relFile: 'usage.md',
    content: '# Usage',
    expectedUrl: 'https://sap.github.io/cloud-mta-build-tool/usage/#usage'
  },

  // UI5 Web Components
  {
    libraryId: '/ui5-webcomponents',
    relFile: '1-getting-started/01-first-steps.md',
    content: '# First Steps',
    expectedUrl: 'https://ui5.github.io/webcomponents/docs/getting-started/first-steps/'
  },
  {
    libraryId: '/ui5-webcomponents',
    relFile: '2-advanced/01-configuration.md',
    content: '# Configuration',
    expectedUrl: 'https://ui5.github.io/webcomponents/docs/advanced/configuration/'
  },
  {
    libraryId: '/ui5-webcomponents',
    relFile: '4-development/03-properties.md',
    content: '# Properties',
    expectedUrl: 'https://ui5.github.io/webcomponents/docs/development/properties/'
  },

  // Cloud SDK JavaScript
  {
    libraryId: '/cloud-sdk-js',
    relFile: 'getting-started.mdx',
    content: fm('getting-started', 'Getting Started'),
    expectedUrl: 'https://sap.github.io/cloud-sdk/docs/js/getting-started'
  },
  {
    libraryId: '/cloud-sdk-js',
    relFile: 'guides/debug-remote-app.mdx',
    content: fm('remote-debugging', 'Remotely debug an application on SAP BTP'),
    expectedUrl: 'https://sap.github.io/cloud-sdk/docs/js/guides/remote-debugging'
  },
  {
    libraryId: '/cloud-sdk-js',
    relFile: 'features/connectivity/destination.mdx',
    content: fm('destinations', 'Destinations'),
    expectedUrl: 'https://sap.github.io/cloud-sdk/docs/js/features/connectivity/destinations'
  },

  // Cloud SDK Java
  {
    libraryId: '/cloud-sdk-java',
    relFile: 'faq.mdx',
    content: fm('frequently-asked-questions', 'Frequently Asked Questions'),
    expectedUrl: 'https://sap.github.io/cloud-sdk/docs/java/frequently-asked-questions'
  },
  {
    libraryId: '/cloud-sdk-java',
    relFile: 'features/odata/overview.mdx',
    content: fm('overview', 'OData'),
    expectedUrl: 'https://sap.github.io/cloud-sdk/docs/java/features/odata/overview'
  },
  {
    libraryId: '/cloud-sdk-java',
    relFile: 'features/connectivity/000-overview.mdx',
    content: fm('destination-service', 'Connectivity Features'),
    expectedUrl: 'https://sap.github.io/cloud-sdk/docs/java/features/connectivity/destination-service'
  },

  // Cloud SDK AI JavaScript
  {
    libraryId: '/cloud-sdk-ai-js',
    relFile: 'getting-started.mdx',
    content: fm('getting-started', 'Getting Started'),
    expectedUrl: 'https://sap.github.io/ai-sdk/docs/js/getting-started'
  },
  {
    libraryId: '/cloud-sdk-ai-js',
    relFile: 'orchestration/chat-completion.mdx',
    content: fm('chat-completion', 'Chat Completion'),
    expectedUrl: 'https://sap.github.io/ai-sdk/docs/js/orchestration/chat-completion'
  },
  {
    libraryId: '/cloud-sdk-ai-js',
    relFile: 'langchain/orchestration.mdx',
    content: fm('orchestration', 'Orchestration Integration'),
    expectedUrl: 'https://sap.github.io/ai-sdk/docs/js/langchain/orchestration'
  },

  // Cloud SDK AI Java
  {
    libraryId: '/cloud-sdk-ai-java',
    relFile: 'getting-started.mdx',
    content: fm('getting-started', 'Getting Started'),
    expectedUrl: 'https://sap.github.io/ai-sdk/docs/java/getting-started'
  },
  {
    libraryId: '/cloud-sdk-ai-java',
    relFile: 'orchestration/chat-completion.mdx',
    content: fm('chat-completion', 'Chat Completion'),
    expectedUrl: 'https://sap.github.io/ai-sdk/docs/java/orchestration/chat-completion'
  },
  {
    libraryId: '/cloud-sdk-ai-java',
    relFile: 'spring-ai/orchestration.mdx',
    content: fm('orchestration', 'Orchestration Integration'),
    expectedUrl: 'https://sap.github.io/ai-sdk/docs/java/spring-ai/orchestration'
  },

  // UI5 TypeScript
  {
    libraryId: '/ui5-typescript',
    relFile: 'README.md',
    content: '# UI5-TypeScript',
    expectedUrl: 'https://ui5.github.io/typescript#ui5-typescript'
  },
  {
    libraryId: '/ui5-typescript',
    relFile: 'faq.md',
    content: '# FAQ - Frequently Asked Questions for the UI5 Type Definitions',
    expectedUrl: 'https://ui5.github.io/typescript/faq.html#faq---frequently-asked-questions-for-the-ui5-type-definitions'
  },
  {
    libraryId: '/ui5-typescript',
    relFile: 'technical.md',
    content: '# Technical Background',
    expectedUrl: 'https://ui5.github.io/typescript/technical.html#technical-background'
  },

  // UI5 Spreadsheet Importer
  {
    libraryId: '/ui5-cc-spreadsheetimporter',
    relFile: 'pages/Checks.md',
    content: '## Error Types',
    expectedUrl: 'https://docs.spreadsheet-importer.com/pages/Checks/#error-types'
  },
  {
    libraryId: '/ui5-cc-spreadsheetimporter',
    relFile: 'pages/Configuration.md',
    content: '# Configuration',
    expectedUrl: 'https://docs.spreadsheet-importer.com/pages/Configuration/#configuration'
  },
  {
    libraryId: '/ui5-cc-spreadsheetimporter',
    relFile: 'pages/GettingStarted.md',
    content: '## Deployment Strategy',
    expectedUrl: 'https://docs.spreadsheet-importer.com/pages/GettingStarted/#deployment-strategy'
  },

  // GitHub blob documentation and samples
  {
    libraryId: '/abap-cheat-sheets',
    relFile: '01_Internal_Tables.md',
    content: '# Internal Tables',
    expectedUrl: 'https://github.com/SAP-samples/abap-cheat-sheets/blob/main/01_Internal_Tables.md#internal-tables'
  },
  {
    libraryId: '/abap-cheat-sheets',
    relFile: '03_ABAP_SQL.md',
    content: '# ABAP SQL',
    expectedUrl: 'https://github.com/SAP-samples/abap-cheat-sheets/blob/main/03_ABAP_SQL.md#abap-sql'
  },
  {
    libraryId: '/abap-cheat-sheets',
    relFile: '08_EML_ABAP_for_RAP.md',
    content: '# ABAP for RAP: Entity Manipulation Language (ABAP EML)',
    expectedUrl: 'https://github.com/SAP-samples/abap-cheat-sheets/blob/main/08_EML_ABAP_for_RAP.md#abap-for-rap-entity-manipulation-language-abap-eml'
  },
  {
    libraryId: '/sap-styleguides',
    relFile: 'clean-abap/CleanABAP.md',
    content: '# Clean ABAP',
    expectedUrl: 'https://github.com/SAP/styleguides/blob/main/clean-abap/CleanABAP.md#clean-abap'
  },
  {
    libraryId: '/sap-styleguides',
    relFile: 'abap-code-review/ABAPCodeReview.md',
    content: '# ABAP Code Reviews',
    expectedUrl: 'https://github.com/SAP/styleguides/blob/main/abap-code-review/ABAPCodeReview.md#abap-code-reviews'
  },
  {
    libraryId: '/sap-styleguides',
    relFile: 'clean-abap/sub-sections/ModernABAPLanguageElements.md',
    content: '# Modern ABAP Language Elements',
    expectedUrl: 'https://github.com/SAP/styleguides/blob/main/clean-abap/sub-sections/ModernABAPLanguageElements.md#modern-abap-language-elements'
  },

  // DSAG ABAP Guide
  {
    libraryId: '/dsag-abap-leitfaden',
    relFile: 'clean-core/what-is-clean-core.md',
    content: '---\npermalink: /clean-core/what-is-clean-core/\n---\n# Was ist Clean Core?',
    expectedUrl: 'https://marianfoo.github.io/DSAG-ABAP-Guide/clean-core/what-is-clean-core/#was-ist-clean-core'
  },
  {
    libraryId: '/dsag-abap-leitfaden',
    relFile: 'abap/OO-basics.md',
    content: '---\npermalink: /abap/oo-basics/\n---\n# Ergänzungen und Details zu Themen der Objektorientierung',
    expectedUrl: 'https://marianfoo.github.io/DSAG-ABAP-Guide/abap/oo-basics/#ergänzungen-und-details-zu-themen-der-objektorientierung'
  },
  {
    libraryId: '/dsag-abap-leitfaden',
    relFile: 'testing/recommendations.md',
    content: '---\npermalink: /testing/recommendations/\n---\n# Empfehlungen',
    expectedUrl: 'https://marianfoo.github.io/DSAG-ABAP-Guide/testing/recommendations/#empfehlungen'
  },

  // ABAP Fiori Showcase
  {
    libraryId: '/abap-fiori-showcase',
    relFile: '01_general_features.md',
    content: '# General Features',
    expectedUrl: 'https://github.com/SAP-samples/abap-platform-fiori-feature-showcase/blob/main/01_general_features.md#general-features'
  },
  {
    libraryId: '/abap-fiori-showcase',
    relFile: '02_list_report_header.md',
    content: '# List Report Header',
    expectedUrl: 'https://github.com/SAP-samples/abap-platform-fiori-feature-showcase/blob/main/02_list_report_header.md#list-report-header'
  },
  {
    libraryId: '/abap-fiori-showcase',
    relFile: '04_object_page_general.md',
    content: '# Object Page General',
    expectedUrl: 'https://github.com/SAP-samples/abap-platform-fiori-feature-showcase/blob/main/04_object_page_general.md#object-page-general'
  },

  // CAP Fiori Showcase
  {
    libraryId: '/cap-fiori-showcase',
    relFile: 'README.md',
    content: '# SAP Fiori Elements for OData V4 Feature Showcase',
    expectedUrl: 'https://github.com/SAP-samples/fiori-elements-feature-showcase/blob/main/README.md#sap-fiori-elements-for-odata-v4-feature-showcase'
  },
  {
    libraryId: '/cap-fiori-showcase',
    relFile: 'app/services.cds',
    content: 'service CatalogService {}',
    expectedUrl: 'https://github.com/SAP-samples/fiori-elements-feature-showcase/blob/main/app/services.cds?plain=1'
  },
  {
    libraryId: '/cap-fiori-showcase',
    relFile: 'db/schema.cds',
    content: 'namespace sap.fe.showcase;',
    expectedUrl: 'https://github.com/SAP-samples/fiori-elements-feature-showcase/blob/main/db/schema.cds?plain=1'
  },

  // ABAP RAP sample repositories
  {
    libraryId: '/abap-platform-rap-opensap',
    relFile: 'README.md',
    content: '# Welcome to the ABAP RESTful Application Programming Model (RAP) openSAP samples',
    expectedUrl: 'https://github.com/SAP-samples/abap-platform-rap-opensap/blob/main/README.md#welcome-to-the-abap-restful-application-programming-model-rap-opensap-samples'
  },
  {
    libraryId: '/abap-platform-rap-opensap',
    relFile: 'week1/README.md',
    content: '# Week 1',
    expectedUrl: 'https://github.com/SAP-samples/abap-platform-rap-opensap/blob/main/week1/README.md#week-1'
  },
  {
    libraryId: '/abap-platform-rap-opensap',
    relFile: 'week1/unit5.md',
    content: '# HANDS-ON EXERCISE FOR WEEK 1 UNIT 5: PREPARING YOUR ABAP DEVELOPMENT ENVIRONMENT',
    expectedUrl: 'https://github.com/SAP-samples/abap-platform-rap-opensap/blob/main/week1/unit5.md#hands-on-exercise-for-week-1-unit-5-preparing-your-abap-development-environment'
  },
  {
    libraryId: '/cloud-abap-rap',
    relFile: 'README.md',
    content: '# Description',
    expectedUrl: 'https://github.com/SAP-samples/cloud-abap-rap/blob/main/README.md#description'
  },
  {
    libraryId: '/cloud-abap-rap',
    relFile: 'optional_parameters.md',
    content: '# Optional parameters for workshops or other advanced scenarios',
    expectedUrl: 'https://github.com/SAP-samples/cloud-abap-rap/blob/main/optional_parameters.md#optional-parameters-for-workshops-or-other-advanced-scenarios'
  },
  {
    libraryId: '/cloud-abap-rap',
    relFile: 'how_to_managed_uuid.md',
    content: '# How to generate a RAP BO using table with UUID based key fields',
    expectedUrl: 'https://github.com/SAP-samples/cloud-abap-rap/blob/main/how_to_managed_uuid.md#how-to-generate-a-rap-bo-using-table-with-uuid-based-key-fields'
  },
  {
    libraryId: '/abap-platform-reuse-services',
    relFile: 'README.md',
    content: '# Reuse services in ABAP Cloud',
    expectedUrl: 'https://github.com/SAP-samples/abap-platform-reuse-services/blob/main/README.md#reuse-services-in-abap-cloud'
  },
  {
    libraryId: '/abap-platform-reuse-services',
    relFile: 'src/zreusecl_test_send_email.clas.abap',
    content: 'CLASS zreusecl_test_send_email DEFINITION.',
    expectedUrl: 'https://github.com/SAP-samples/abap-platform-reuse-services/blob/main/src/zreusecl_test_send_email.clas.abap?plain=1'
  },
  {
    libraryId: '/abap-platform-reuse-services',
    relFile: 'src/zreuseif_002.intf.abap',
    content: 'INTERFACE zreuseif_002 PUBLIC.',
    expectedUrl: 'https://github.com/SAP-samples/abap-platform-reuse-services/blob/main/src/zreuseif_002.intf.abap?plain=1'
  },

  // ABAP keyword docs
  {
    libraryId: '/abap-docs-standard',
    relFile: 'ABAPADD.md',
    content: '# ADD',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPADD.html'
  },
  {
    libraryId: '/abap-docs-standard',
    relFile: 'ABAPSELECT.md',
    content: '# SELECT',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPSELECT.html'
  },
  {
    libraryId: '/abap-docs-standard',
    relFile: 'ABAPLOOP_AT_DBTAB.md',
    content: '# LOOP AT dbtab',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPLOOP_AT_DBTAB.html'
  },
  {
    libraryId: '/abap-docs-standard',
    relFile: 'ABENABAP.md',
    content: '# ABAP - Keyword Documentation',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABENABAP.html'
  },
  {
    libraryId: '/abap-docs-standard',
    relFile: 'ABAPDATA.md',
    content: '# DATA',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPDATA.html'
  },
  {
    libraryId: '/abap-docs-standard',
    relFile: 'ABAPINSERT_ITAB.md',
    content: '# INSERT, Internal Tables',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPINSERT_ITAB.html'
  },
  {
    libraryId: '/abap-docs-standard',
    relFile: 'ABAPLOOP_AT_ITAB.md',
    content: '# LOOP AT itab',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPLOOP_AT_ITAB.html'
  },
  {
    libraryId: '/abap-docs-standard',
    relFile: 'ABAPREAD_TABLE.md',
    content: '# READ TABLE',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPREAD_TABLE.html'
  },
  {
    libraryId: '/abap-docs-standard',
    relFile: 'ABAPMODIFY_ITAB.md',
    content: '# MODIFY itab',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPMODIFY_ITAB.html'
  },
  {
    libraryId: '/abap-docs-standard',
    relFile: 'ABAPCLASS.md',
    content: '# CLASS',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPCLASS.html'
  },
  {
    libraryId: '/abap-docs-standard',
    relFile: 'ABAPMETHODS.md',
    content: '# METHODS',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPMETHODS.html'
  },
  {
    libraryId: '/abap-docs-standard',
    relFile: 'ABAPCOMMIT.md',
    content: '# COMMIT WORK',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPCOMMIT.html'
  },
  {
    libraryId: '/abap-docs-standard',
    relFile: 'ABAPTRY.md',
    content: '# TRY',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPTRY.html'
  },
  {
    libraryId: '/abap-docs-cloud',
    relFile: 'ABAPADD.md',
    content: '# ADD',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/ABAPADD.html'
  },
  {
    libraryId: '/abap-docs-cloud',
    relFile: 'ABAPALIASES.md',
    content: '# ALIASES',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/ABAPALIASES.html'
  },
  {
    libraryId: '/abap-docs-cloud',
    relFile: 'ABAPAPPEND.md',
    content: '# APPEND',
    expectedUrl: 'https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/ABAPAPPEND.html'
  },

  // SAP Help LOIO docs
  {
    libraryId: '/btp-cloud-platform',
    relFile: 'sap-business-technology-platform-6a2c1ab.md',
    content: loio('6a2c1ab5a31b4ed9a2ce17a5329e1dd8', 'SAP Business Technology Platform'),
    expectedUrl: 'https://help.sap.com/docs/BTP/65de2977205c403bbc107264b8eccf4b/6a2c1ab5a31b4ed9a2ce17a5329e1dd8.html'
  },
  {
    libraryId: '/btp-cloud-platform',
    relFile: 'index.md',
    content: '# SAP Business Technology Platform',
    expectedUrl: 'https://help.sap.com/docs/BTP/65de2977205c403bbc107264b8eccf4b'
  },
  {
    libraryId: '/btp-cloud-platform',
    relFile: '20-getting-started/creating-an-abap-system-50b32f1.md',
    content: loio('50b32f144e184154987a06e4b55ce447', 'Creating an ABAP System'),
    expectedUrl: 'https://help.sap.com/docs/BTP/65de2977205c403bbc107264b8eccf4b/50b32f144e184154987a06e4b55ce447.html'
  },
  {
    libraryId: '/btp-cloud-platform',
    relFile: '70-getting-support/support-components-08d1103.md',
    content: loio('08d1103928fb42f3a73b3f425e00e13c', 'Support Components'),
    expectedUrl: 'https://help.sap.com/docs/BTP/65de2977205c403bbc107264b8eccf4b/08d1103928fb42f3a73b3f425e00e13c.html'
  },
  {
    libraryId: '/sap-artificial-intelligence',
    relFile: 'sap-ai-core/sap-ai-core-overview-88e0078.md',
    content: loio('88e007863ca545438e274cbf6ce2d7c6', 'SAP AI Core Overview'),
    expectedUrl: 'https://help.sap.com/docs/AI_CORE/2d6c5984063c40a59eda62f4a9135bee/88e007863ca545438e274cbf6ce2d7c6.html?version=CLOUD'
  },
  {
    libraryId: '/sap-artificial-intelligence',
    relFile: 'sap-ai-core/index.md',
    content: '# SAP AI Core',
    expectedUrl: 'https://help.sap.com/docs/AI_CORE/2d6c5984063c40a59eda62f4a9135bee?version=CLOUD'
  },
  {
    libraryId: '/sap-artificial-intelligence',
    relFile: 'sap-ai-core/delete-a-docker-registry-secret-5ff30f0.md',
    content: loio('5ff30f0332b8452d97ed77edf746714a', 'Delete a Docker Registry Secret'),
    expectedUrl: 'https://help.sap.com/docs/AI_CORE/2d6c5984063c40a59eda62f4a9135bee/5ff30f0332b8452d97ed77edf746714a.html?version=CLOUD'
  },
  {
    libraryId: '/sap-artificial-intelligence',
    relFile: 'sap-ai-launchpad/using-sap-ai-launchpad-bbc7e21.md',
    content: loio('bbc7e21629ce4aef87d85c30cc8b1be8', 'Using SAP AI Launchpad'),
    expectedUrl: 'https://help.sap.com/docs/AI_LAUNCHPAD/92d77f26188e4582897b9106b9cb72e0/bbc7e21629ce4aef87d85c30cc8b1be8.html?version=CLOUD'
  },
  {
    libraryId: '/sap-artificial-intelligence',
    relFile: 'sap-ai-launchpad/index.md',
    content: '# SAP AI Launchpad',
    expectedUrl: 'https://help.sap.com/docs/AI_LAUNCHPAD/92d77f26188e4582897b9106b9cb72e0?version=CLOUD'
  },

  // Terraform Registry
  {
    libraryId: '/terraform-provider-btp',
    relFile: 'docs/index.md',
    content: '# Terraform Provider for SAP BTP',
    expectedUrl: 'https://registry.terraform.io/providers/SAP/btp/latest/docs'
  },
  {
    libraryId: '/terraform-provider-btp',
    relFile: 'docs/data-sources/subaccount.md',
    content: '# btp_subaccount (Data Source)',
    expectedUrl: 'https://registry.terraform.io/providers/SAP/btp/latest/docs/data-sources/subaccount'
  },
  {
    libraryId: '/terraform-provider-btp',
    relFile: 'docs/resources/subaccount.md',
    content: '# btp_subaccount (Resource)',
    expectedUrl: 'https://registry.terraform.io/providers/SAP/btp/latest/docs/resources/subaccount'
  },

  // SAP Architecture Center
  {
    libraryId: '/architecture-center',
    relFile: 'RA0001/readme.md',
    content: '---\nslug: /ref-arch/fbdc46aaae\n---\n# Designing Event-Driven Applications',
    expectedUrl: 'https://architecture.learning.sap.com/docs/ref-arch/fbdc46aaae'
  },
  {
    libraryId: '/architecture-center',
    relFile: 'RA0005/readme.md',
    content: '---\nslug: /ref-arch/e5eb3b9b1d\n---\n# Generative AI on SAP BTP',
    expectedUrl: 'https://architecture.learning.sap.com/docs/ref-arch/e5eb3b9b1d'
  },
  {
    libraryId: '/architecture-center',
    relFile: 'RA0010/readme.md',
    content: '---\nslug: /ref-arch/1311c18c17\n---\n# Establish a central entry point with SAP Build Work Zone',
    expectedUrl: 'https://architecture.learning.sap.com/docs/ref-arch/1311c18c17'
  },

  // TechEd 2025 DT260
  {
    libraryId: '/teched2025-dt260',
    relFile: 'README.md',
    content: '# DT260 - Modernize classic extensions to clean core in Cloud ERP Private',
    expectedUrl: 'https://github.com/SAP-samples/teched2025-DT260/blob/main/README.md#dt260---modernize-classic-extensions-to-clean-core-in-cloud-erp-private'
  },
  {
    libraryId: '/teched2025-dt260',
    relFile: 'exercises/ex0/README.md',
    content: '# Getting Started',
    expectedUrl: 'https://github.com/SAP-samples/teched2025-DT260/blob/main/exercises/ex0/README.md#getting-started'
  },
  {
    libraryId: '/teched2025-dt260',
    relFile: 'exercises/ex1/README.md',
    content: '# Exercise 1 - Modernize the Flight Evaluation application with ABAP Cloud',
    expectedUrl: 'https://github.com/SAP-samples/teched2025-DT260/blob/main/exercises/ex1/README.md#exercise-1---modernize-the-flight-evaluation-application-with-abap-cloud'
  }
];

describe('source URL matrix', () => {
  it.each(sourceUrlCases)('$libraryId $relFile', ({ libraryId, relFile, content, expectedUrl }) => {
    const config = getDocUrlConfig(libraryId);
    expect(config, `missing URL config for ${libraryId}`).toBeTruthy();

    const result = generateDocumentationUrl(libraryId, relFile, content, config!);
    expect(result).toBe(expectedUrl);
  });

  it('covers at least three URL cases for every configured source', () => {
    const counts = new Map<string, number>();
    for (const testCase of sourceUrlCases) {
      counts.set(testCase.libraryId, (counts.get(testCase.libraryId) || 0) + 1);
    }

    const configuredLibraryIds = Object.keys(getAllDocUrlConfigs()).sort();
    const undercovered = configuredLibraryIds
      .map(libraryId => [libraryId, counts.get(libraryId) || 0] as const)
      .filter(([, count]) => count < 3);

    expect(undercovered).toEqual([]);
  });
});

describe('online source URL normalization', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    global.sapHelpSearchCache = undefined;
    vi.restoreAllMocks();
  });

  it('normalizes SAP Help search result URLs to absolute help.sap.com URLs', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: {
        results: [
          {
            loio: 'a',
            title: 'Relative docs URL',
            url: '/docs/BTP/65de2977205c403bbc107264b8eccf4b/6a2c1ab5a31b4ed9a2ce17a5329e1dd8.html'
          },
          {
            loio: 'b',
            title: 'Absolute docs URL',
            url: 'https://help.sap.com/docs/AI_CORE/2d6c5984063c40a59eda62f4a9135bee/88e007863ca545438e274cbf6ce2d7c6.html?version=CLOUD'
          },
          {
            loio: 'c',
            title: 'Relative doc URL without leading slash',
            url: 'doc/abapdocu_latest_index_htm/latest/en-US/ABAPADD.html'
          }
        ]
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as any;

    const response = await searchSapHelp('url normalization');

    expect(response.results.map(result => result.url)).toEqual([
      'https://help.sap.com/docs/BTP/65de2977205c403bbc107264b8eccf4b/6a2c1ab5a31b4ed9a2ce17a5329e1dd8.html',
      'https://help.sap.com/docs/AI_CORE/2d6c5984063c40a59eda62f4a9135bee/88e007863ca545438e274cbf6ce2d7c6.html?version=CLOUD',
      'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/ABAPADD.html'
    ]);
  });

  it('creates stable SAP Help IDs for hits without LOIO values', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: {
        results: [
          {
            title: 'SAP AI Launchpad User Guide',
            url: '/doc/sap-ai-launchpad-user-guide.pdf',
            loio: undefined,
            product: 'SAP AI Launchpad'
          }
        ]
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as any;

    const response = await searchSapHelp('SAP AI Launchpad User Guide');

    expect(response.results[0].id).toMatch(/^sap-help-url-sap-ai-launchpad-user-guide-[a-f0-9]{12}$/);
    expect(response.results[0].id).not.toBe('sap-help-undefined');
    expect(response.results[0].url).toBe('https://help.sap.com/doc/sap-ai-launchpad-user-guide.pdf');
  });

  it('normalizes SAP Community relative, absolute, and fallback URLs', () => {
    expect(normalizeCommunityUrl('/t5/technology-blogs-by-sap/example/ba-p/123456')).toBe(
      'https://community.sap.com/t5/technology-blogs-by-sap/example/ba-p/123456'
    );
    expect(normalizeCommunityUrl('t5/technology-q-a/example/qaq-p/42')).toBe(
      'https://community.sap.com/t5/technology-q-a/example/qaq-p/42'
    );
    expect(normalizeCommunityUrl(undefined, '987654')).toBe(
      'https://community.sap.com/t5/forums/messagepage/message-id/987654'
    );
  });
});
