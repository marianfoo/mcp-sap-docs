import { BaseUrlGenerator, UrlGenerationContext } from './BaseUrlGenerator.js';
import { FrontmatterData } from './utils.js';

const BTP_DELIVERABLE = '65de2977205c403bbc107264b8eccf4b';
const AI_CORE_DELIVERABLE = '2d6c5984063c40a59eda62f4a9135bee';
const AI_LAUNCHPAD_DELIVERABLE = '92d77f26188e4582897b9106b9cb72e0';

function extractLoio(content: string, relFile: string): string | null {
  const commentMatch = content.match(/<!--\s*loio([a-f0-9]{32})\s*-->/i);
  if (commentMatch) {
    return commentMatch[1];
  }

  const fileMatch = relFile.match(/([a-f0-9]{32})\.md$/i);
  if (fileMatch) {
    return fileMatch[1];
  }

  return null;
}

function isIndexPage(relFile: string): boolean {
  return !relFile || /(?:^|\/)(?:index|README)\.md$/i.test(relFile);
}

export class SapHelpLoioUrlGenerator extends BaseUrlGenerator {
  public generateUrl(context: UrlGenerationContext): string | null {
    return this.generateSourceSpecificUrl({
      ...context,
      frontmatter: this.parseFrontmatter(context.content),
      section: this.extractSection(context.relFile),
      anchor: null
    });
  }

  protected generateSourceSpecificUrl(context: UrlGenerationContext & {
    frontmatter: FrontmatterData;
    section: string;
    anchor: string | null;
  }): string | null {
    const loio = extractLoio(context.content, context.relFile);
    if (!loio) {
      if (this.libraryId === '/btp-cloud-platform' && isIndexPage(context.relFile)) {
        return `https://help.sap.com/docs/BTP/${BTP_DELIVERABLE}`;
      }

      if (this.libraryId === '/sap-artificial-intelligence') {
        if (!context.relFile || context.relFile.startsWith('sap-ai-core/')) {
          return `https://help.sap.com/docs/AI_CORE/${AI_CORE_DELIVERABLE}?version=CLOUD`;
        }

        if (context.relFile.startsWith('sap-ai-launchpad/')) {
          return `https://help.sap.com/docs/AI_LAUNCHPAD/${AI_LAUNCHPAD_DELIVERABLE}?version=CLOUD`;
        }
      }

      return null;
    }

    if (this.libraryId === '/btp-cloud-platform') {
      return `https://help.sap.com/docs/BTP/${BTP_DELIVERABLE}/${loio}.html`;
    }

    if (this.libraryId === '/sap-artificial-intelligence') {
      if (context.relFile.startsWith('sap-ai-core/')) {
        return `https://help.sap.com/docs/AI_CORE/${AI_CORE_DELIVERABLE}/${loio}.html?version=CLOUD`;
      }

      if (context.relFile.startsWith('sap-ai-launchpad/')) {
        return `https://help.sap.com/docs/AI_LAUNCHPAD/${AI_LAUNCHPAD_DELIVERABLE}/${loio}.html?version=CLOUD`;
      }
    }

    return null;
  }
}
