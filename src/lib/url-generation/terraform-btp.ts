/**
 * URL generator for SAP terraform-provider-btp docs.
 * Keeps nested docs paths (docs/resources/..., docs/functions/..., etc.).
 */

import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';

export class TerraformBtpUrlGenerator extends BaseUrlGenerator {
  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    const relPath = context.relFile.replace(/\.mdx?$/, '');
    let url = this.config.baseUrl + this.config.pathPattern.replace('{file}', relPath);

    if (context.anchor) {
      url += this.getSeparator() + context.anchor;
    }

    return url;
  }
}
