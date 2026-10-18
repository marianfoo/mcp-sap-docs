import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { detectContentSection, FrontmatterData } from './utils.js';
import matter from 'gray-matter';

function encodePath(path: string): string {
  return path
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/');
}

export class GithubBlobUrlGenerator extends BaseUrlGenerator {
  protected generateAnchor(content: string): string | null {
    // A Python/shell comment inside a code fence is not a rendered heading.
    let body: string;
    try { body = matter(content).content; } catch { body = content; }
    let fence = '';
    for (const line of body.split(/\r?\n/)) {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && line.trim() === marker[1]) fence = '';
        continue;
      }
      if (fence) continue;
      const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/);
      if (heading) {
        const text = heading[1].replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '');
        return detectContentSection(`# ${text}`, 'github');
      }
    }
    return null;
  }

  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    const relPath = encodePath(context.relFile);
    let url = this.buildUrl(this.config.baseUrl, relPath);

    if (!/\.mdx?$/i.test(context.relFile)) {
      url += '?plain=1';
    }

    if (context.anchor) {
      url += `#${context.anchor}`;
    }

    return url;
  }
}
