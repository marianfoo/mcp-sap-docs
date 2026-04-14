/**
 * URL Generator for SAP Architecture Center
 *
 * The Architecture Center uses Docusaurus with custom slugs in frontmatter.
 * Each reference architecture has a slug like "/ref-arch/fbdc46aaae" which
 * maps to the URL: https://architecture.learning.sap.com/docs/ref-arch/fbdc46aaae
 *
 * The slug takes priority over the id field (which is "id-ra0001" style).
 */

import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';

export class ArchitectureCenterUrlGenerator extends BaseUrlGenerator {

  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    const slug = context.frontmatter.slug;

    if (slug) {
      // Slug-based URLs are complete identifiers — don't append content anchors
      return this.config.baseUrl + slug;
    }

    return null;
  }
}
