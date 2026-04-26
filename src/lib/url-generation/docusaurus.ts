import { FrontmatterData } from './utils.js';

export function stripMarkdownExtension(path: string): string {
  return path.replace(/\.mdx?$/, '');
}

export function stripNumericPrefix(segment: string): string {
  return segment.replace(/^\d+[-_]/, '');
}

export function removeIndexSegments(segments: string[]): string[] {
  return segments.filter(segment => !/^(?:index|README)$/i.test(segment));
}

export function buildDocusaurusPath(relFile: string, frontmatterOrIdentifier?: FrontmatterData | string | null): string {
  const frontmatter = typeof frontmatterOrIdentifier === 'object' ? frontmatterOrIdentifier : null;
  const identifier = typeof frontmatterOrIdentifier === 'string'
    ? frontmatterOrIdentifier
    : frontmatter?.id || null;

  const rawSegments = stripMarkdownExtension(relFile).split('/').filter(Boolean);
  const normalizedSegments = removeIndexSegments(rawSegments.map(stripNumericPrefix));

  if (frontmatter?.slug) {
    const slug = String(frontmatter.slug).replace(/^\/+|\/+$/g, '');
    if (String(frontmatter.slug).startsWith('/')) {
      return slug;
    }

    return [...normalizedSegments.slice(0, -1), slug].filter(Boolean).join('/');
  }

  if (!identifier) {
    return normalizedSegments.join('/');
  }

  const dirSegments = normalizedSegments.slice(0, -1);
  const lastDirSegment = dirSegments[dirSegments.length - 1];

  if (lastDirSegment === identifier) {
    return dirSegments.join('/');
  }

  return [...dirSegments, identifier].join('/');
}
