import fs from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

type TutorialConfig = {
  groups: Record<string, { name: string; keywords: string[]; tutorials: string[] }>;
  urlOverrides: Record<string, string>;
  assetOverrides: Record<string, string>;
};

export const TUTORIALS: TutorialConfig = JSON.parse(readFileSync('config/tutorials.json', 'utf8'));
const SOURCE_BASE = 'https://github.com/sap-tutorials/Tutorials/blob/master/tutorials/';

export function tutorialUrl(id: string): string {
  return TUTORIALS.urlOverrides[id] || `https://developers.sap.com/tutorials/${id}`;
}

/** Make website controls and relative links usable in a standalone Markdown fetch.
 * Code fences, prerequisites, and source wording are preserved.
 */
export function normalizeTutorialMarkdown(content: string, id: string): string {
  let fence = '';
  return content.split('\n').map(line => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && line.trim() === marker[1]) fence = '';
      return line;
    }
    if (fence) return line;
    return line
      .replace(/\[OPTION BEGIN \[([^\]]+)\]\]/g, '**Option: $1**')
      .replace(/\[OPTION END\]/g, '')
      .replace(/<!-- description -->\s*/g, '')
      .replace(/(!?\[[^\]]*\])\(([^\s)]+)\)/g, (original, label: string, target: string) => {
        if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target)) return original;
        target = TUTORIALS.assetOverrides[`${id}/${target}`] || target;
        // Bare tutorial IDs refer to other Developer Center tutorials.
        if (!label.startsWith('!') && /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(target)) {
          return `${label}(${tutorialUrl(target)})`;
        }
        const base = label.startsWith('!')
          ? `https://raw.githubusercontent.com/sap-tutorials/Tutorials/master/tutorials/${id}/`
          : `${SOURCE_BASE}${id}/`;
        return `${label}(${new URL(target, base).href})`;
      });
  }).join('\n');
}

export async function materializeTutorials(
  inputRoot = 'sources/sap-tutorials/tutorials',
  outputRoot = 'sources/tutorials-generated',
): Promise<void> {
  // Partial builds (e.g. the Open UX setup test) may not clone tutorials at all.
  // Clear prior output even then, so a missing checkout cannot index stale files.
  await fs.rm(outputRoot, { recursive: true, force: true });
  if (!existsSync(inputRoot)) return;
  for (const [group, config] of Object.entries(TUTORIALS.groups)) {
    const outputDir = path.join(outputRoot, group);
    await fs.mkdir(outputDir, { recursive: true });
    for (const id of config.tutorials) {
      // Missing allowlisted inputs fail the build, instead of silently dropping content.
      const raw = await fs.readFile(path.join(inputRoot, id, `${id}.md`), 'utf8');
      const parsed = matter(raw);
      const title = parsed.content.match(/^#\s+(.+)$/m)?.[1].trim() || id;
      const description = parsed.content.match(/<!-- description -->\s*([^\n]+)/)?.[1] || title;
      const body = `**URL:** ${tutorialUrl(id)}\n**Source:** ${SOURCE_BASE}${id}/${id}.md\n\n${normalizeTutorialMarkdown(parsed.content, id)}`;
      const markdown = matter.stringify(body, {
        ...parsed.data,
        title: `${config.name}: ${title}`,
        description,
        keywords: [...config.keywords, id],
      });
      await fs.writeFile(path.join(outputDir, `${id}.md`), markdown);
    }
  }
}
