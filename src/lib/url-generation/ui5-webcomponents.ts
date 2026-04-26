import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { buildDocusaurusPath } from './docusaurus.js';
import { FrontmatterData } from './utils.js';

export class Ui5WebComponentsUrlGenerator extends BaseUrlGenerator {
  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    const route = buildDocusaurusPath(context.relFile, context.frontmatter);
    return this.buildUrl(this.config.baseUrl, 'docs', route) + '/';
  }
}
