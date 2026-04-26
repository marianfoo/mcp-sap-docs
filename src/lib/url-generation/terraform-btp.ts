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
    const relPath = context.relFile.replace(/^docs\//, '').replace(/\.md$/, '');
    const registryPath = relPath === 'index' ? '' : relPath;
    return this.buildUrl(this.config.baseUrl, registryPath);
  }
}
