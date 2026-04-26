/**
 * URL generation for SAP CAP (Cloud Application Programming) documentation
 * Handles CDS guides, reference docs, and tutorials
 */

import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';
import { DocUrlConfig } from '../metadata.js';
import { getProjectRoot } from '../sourceContent.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CAP_SOURCE_ROOT = path.join(getProjectRoot(), 'sources', 'cap-docs');

const CAP_LEGACY_ROUTE_MIGRATIONS: Record<string, string> = {
  'about/best-practices.md': 'get-started/concepts',
  'about/features.md': 'get-started/feature-matrix',
  'about/index.md': 'get-started/features',
  'advanced/fiori.md': 'guides/uis/fiori',
  'advanced/hana.md': 'guides/databases/hana-native',
  'advanced/hybrid-testing.md': 'tools/cds-bind',
  'advanced/odata.md': 'guides/protocols/odata',
  'advanced/performance-modeling.md': 'guides/databases/performance',
  'advanced/publishing-apis/asyncapi.md': 'guides/protocols/asyncapi',
  'advanced/publishing-apis/index.md': 'guides/protocols',
  'advanced/publishing-apis/openapi.md': 'guides/protocols/openapi',
  'get-started/in-a-nutshell.md': 'get-started/bookshop',
  'get-started/learning-sources.md': 'get-started/learn-more',
  'get-started/troubleshooting.md': 'get-started/get-help',
  'guides/providing-services.md': 'guides/services/providing-services',
  'guides/using-services.md': 'guides/services/consuming-services',
  'guides/databases.md': 'guides/databases',
  'guides/databases-h2.md': 'guides/databases/h2',
  'guides/databases-hana.md': 'guides/databases/hana',
  'guides/databases-postgres.md': 'guides/databases/postgres',
  'guides/databases-sqlite.md': 'guides/databases/sqlite',
  'guides/deployment/cicd.md': 'guides/deploy/cicd',
  'guides/deployment/custom-builds.md': 'guides/deploy/build',
  'guides/deployment/health-checks.md': 'guides/deploy/health-checks',
  'guides/deployment/index.md': 'guides/deploy',
  'guides/deployment/microservices.md': 'guides/deploy/microservices',
  'guides/deployment/to-cf.md': 'guides/deploy/to-cf',
  'guides/deployment/to-kyma.md': 'guides/deploy/to-kyma',
  'guides/domain-modeling.md': 'guides/domain',
  'guides/temporal-data.md': 'guides/domain/temporal-data',
  'guides/i18n.md': 'guides/uis/i18n',
  'guides/localized-data.md': 'guides/uis/localized-data',
  'guides/messaging/event-broker.md': 'guides/events/event-hub',
  'guides/messaging/event-mesh.md': 'guides/events/event-mesh',
  'guides/messaging/index.md': 'guides/events',
  'guides/messaging/s4.md': 'guides/events/s4',
  'guides/messaging/task-queues.md': 'guides/events/event-queues',
  'guides/data-privacy/annotations.md': 'guides/security/dpp-annotations',
  'guides/data-privacy/audit-logging.md': 'guides/security/dpp-audit-logging',
  'guides/data-privacy/drm.md': 'guides/security/dpp-drm',
  'guides/data-privacy/index.md': 'guides/security/data-privacy',
  'guides/data-privacy/pdm.md': 'guides/security/dpp-pdm',
  'guides/extensibility/composition.md': 'guides/integration/reuse-and-compose',
  'guides/security/aspects.md': 'guides/security/data-protection',
  'guides/security/data-protection-privacy.md': 'guides/security/data-protection'
};

const CAP_GITHUB_BLOB_BASE = 'https://github.com/capire/docs/blob';
let capGitRef: string | null | undefined;

const CAP_REPO_ONLY_PATTERNS = [
  /^(?:CODE_OF_CONDUCT|CONTRIBUTING|README|menu)\.md$/i,
  /(?:^|\/)_menu\.md$/i,
  /(?:^|\/)assets\/.*\.md$/i,
  /^tools\/assets\/help\/.*\.md$/i,
  /^about\/bad-practices\.md$/i,
  /^advanced\/analytics\.md$/i,
  /^advanced\/index\.md$/i,
  /^guides\/querying(?:\.md|\/)/i,
  /^guides\/uis\/analytics\.md$/i,
  /^java\/operating-applications\/sizing\.md$/i
];

let capMenuRouteMap: Map<string, string> | null | undefined;

function encodePathForGithub(relFile: string): string {
  return relFile
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function getCapGitRef(): string {
  if (capGitRef !== undefined) {
    return capGitRef || 'main';
  }

  try {
    capGitRef = execFileSync('git', ['-C', path.join(getProjectRoot(), 'sources', 'cap-docs'), 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    capGitRef = null;
  }

  return capGitRef || 'main';
}

function buildCapGithubBlobUrl(relFile: string): string {
  return `${CAP_GITHUB_BLOB_BASE}/${getCapGitRef()}/${encodePathForGithub(relFile)}`;
}

function isCapRepoOnlyFile(relFile: string): boolean {
  return CAP_REPO_ONLY_PATTERNS.some(pattern => pattern.test(relFile));
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function trimLeadingParentSegments(value: string): string {
  let result = value;
  while (result.startsWith('../')) {
    result = result.slice(3);
  }
  return result.replace(/^\.\//, '');
}

function findCapMenuFiles(dir: string): string[] {
  const result: string[] = [];

  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue;
      }

      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        result.push(...findCapMenuFiles(absPath));
      } else if (entry.name === 'menu.md' || entry.name === '_menu.md') {
        result.push(absPath);
      }
    }
  } catch {
    // Ignore missing or sparse source directories.
  }

  return result;
}

function routeToRelFile(route: string): string {
  if (route.endsWith('/')) {
    const cleanRoute = route.replace(/\/$/, '');
    return cleanRoute ? `${cleanRoute}/index.md` : 'index.md';
  }

  const cleanRoute = route.replace(/\/$/, '');
  if (!cleanRoute) {
    return 'index.md';
  }
  return cleanRoute.endsWith('.md') ? cleanRoute : `${cleanRoute}.md`;
}

function routeToPublicPath(route: string): string {
  return route
    .replace(/\.md$/i, '')
    .replace(/(?:^|\/)(?:index|README)$/i, '')
    .replace(/\/$/, '');
}

function buildCapMenuRouteMap(): Map<string, string> {
  const routeMap = new Map<string, string>();
  for (const menuFile of findCapMenuFiles(CAP_SOURCE_ROOT)) {
    const menuDir = toPosixPath(path.relative(CAP_SOURCE_ROOT, path.dirname(menuFile)));
    const menuContent = fs.readFileSync(menuFile, 'utf8');

    for (const line of menuContent.split(/\r?\n/)) {
      const linkMatch = line.match(/\[[^\]]+\]\(([^)]+)\)/);
      const rawLink = linkMatch?.[1]?.trim();
      if (!rawLink || rawLink.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(rawLink)) {
        continue;
      }

      const linkWithoutAnchor = rawLink.split('#')[0].trim();
      if (!linkWithoutAnchor || /_menu\.md$/i.test(linkWithoutAnchor)) {
        continue;
      }

      const route = trimLeadingParentSegments(toPosixPath(path.posix.normalize(
        linkWithoutAnchor.startsWith('/')
          ? linkWithoutAnchor.slice(1)
          : path.posix.join(menuDir, linkWithoutAnchor)
      )));
      const relFile = routeToRelFile(route);
      const publicPath = routeToPublicPath(route);
      routeMap.set(relFile, publicPath);
    }
  }

  return routeMap;
}

function getCapMenuRoute(relFile: string): string | null {
  if (capMenuRouteMap === undefined) {
    try {
      capMenuRouteMap = buildCapMenuRouteMap();
    } catch {
      capMenuRouteMap = null;
    }
  }

  return capMenuRouteMap?.get(relFile) || null;
}

export interface CapUrlOptions {
  relFile: string;
  content: string;
  config: DocUrlConfig;
  libraryId: string;
}

/**
 * CAP URL Generator
 * Handles CDS guides, reference docs, and tutorials with docsify-style URLs
 */
export class CapUrlGenerator extends BaseUrlGenerator {
  
  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    const normalizedRelFile = context.relFile.replace(/\\/g, '/');

    if (isCapRepoOnlyFile(normalizedRelFile)) {
      return buildCapGithubBlobUrl(normalizedRelFile);
    }

    const route = CAP_LEGACY_ROUTE_MIGRATIONS[normalizedRelFile] || getCapMenuRoute(normalizedRelFile) || normalizedRelFile
      .replace(/\.md$/, '')
      .replace(/(?:^|\/)(?:index|README)$/i, '');

    return this.buildUrl(this.config.baseUrl, 'docs', route);
  }
  
  /**
   * Extract CAP-specific sections from file path
   */
  private extractCapSection(relFile: string): string {
    if (this.isInDirectory(relFile, 'guides')) {
      return 'guides';
    } else if (this.isInDirectory(relFile, 'cds')) {
      return 'cds';
    } else if (this.isInDirectory(relFile, 'node.js')) {
      return 'node.js';
    } else if (this.isInDirectory(relFile, 'java')) {
      return 'java';
    } else if (this.isInDirectory(relFile, 'plugins')) {
      return 'plugins';
    } else if (this.isInDirectory(relFile, 'advanced')) {
      return 'advanced';
    } else if (this.isInDirectory(relFile, 'get-started')) {
      return 'get-started';
    } else if (this.isInDirectory(relFile, 'tutorials')) {
      return 'tutorials';
    }
    
    return '';
  }
  
  /**
   * Override to use CAP-specific section extraction
   */
  protected extractSection(relFile: string): string {
    return this.extractCapSection(relFile);
  }
  
}

// Convenience functions for backward compatibility

/**
 * Generate URL for CAP documentation using the class-based approach
 */
export function generateCapUrl(options: CapUrlOptions): string | null {
  const generator = new CapUrlGenerator(options.libraryId, options.config);
  return generator.generateUrl(options);
}

/**
 * Generate URL for CAP CDS reference documentation
 */
export function generateCapCdsUrl(options: CapUrlOptions): string | null {
  return generateCapUrl(options); // Now handled by the main generator
}

/**
 * Generate URL for CAP tutorials and getting started guides
 */
export function generateCapTutorialUrl(options: CapUrlOptions): string | null {
  return generateCapUrl(options); // Now handled by the main generator
}
