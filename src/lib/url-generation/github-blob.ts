import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';

function encodePath(path: string): string {
  return path
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/');
}

export class GithubBlobUrlGenerator extends BaseUrlGenerator {
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
