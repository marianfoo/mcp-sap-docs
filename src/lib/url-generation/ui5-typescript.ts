import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';

function toHtmlPath(relFile: string): string {
  if (/^README\.md$/i.test(relFile) || /^index\.md$/i.test(relFile)) {
    return '';
  }

  return relFile.replace(/\.md$/i, '.html');
}

export class Ui5TypeScriptUrlGenerator extends BaseUrlGenerator {
  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    let url = this.buildUrl(this.config.baseUrl, toHtmlPath(context.relFile));

    if (context.anchor) {
      url += `#${context.anchor}`;
    }

    return url;
  }
}
