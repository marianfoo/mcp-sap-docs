import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';

function stripMarkdownExtension(path: string): string {
  return path.replace(/\.mdx?$/, '');
}

function dropIndex(path: string): string {
  return path.replace(/(?:^|\/)(?:index|README)$/i, '');
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

export class MkDocsUrlGenerator extends BaseUrlGenerator {
  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    const docPath = dropIndex(stripMarkdownExtension(context.relFile));
    let url = ensureTrailingSlash(this.buildUrl(this.config.baseUrl, docPath));

    if (context.anchor) {
      url += `#${context.anchor}`;
    }

    return url;
  }
}
