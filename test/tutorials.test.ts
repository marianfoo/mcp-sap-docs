import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import matter from 'gray-matter';
import { TUTORIALS, normalizeTutorialMarkdown, tutorialUrl } from '../scripts/materialize-tutorials.js';
import { generateDocumentationUrl } from '../src/lib/url-generation/index.js';
import { getDocUrlConfig } from '../src/lib/metadata.js';

const selected = Object.values(TUTORIALS.groups).flatMap(group => group.tutorials);

describe('curated SAP tutorials', () => {
  it('keeps an explicit, unique 32-tutorial selection', () => {
    expect(selected).toHaveLength(32);
    expect(new Set(selected).size).toBe(32);
    expect(selected).not.toContain('ai-core-orchestration-consumption-opt-v2');
  });

  it('resolves tutorial prerequisites, assets and option labels without rewriting code', () => {
    const code = '```python\n# example\ntext = "[download](file.json) [OPTION END]"\n```';
    const input = '[OPTION BEGIN [Python]]\n[Prerequisite](hana-cloud-deploying)\n![Setup](img/setup.png)\n[Download](img/file.json)\n'+code+'\n[OPTION END]';
    const result = normalizeTutorialMarkdown(input, 'example-guide');
    expect(result).toContain('**Option: Python**');
    expect(result).toContain('[Prerequisite](https://developers.sap.com/tutorials/hana-cloud-deploying)');
    expect(result).toContain('![Setup](https://raw.githubusercontent.com/sap-tutorials/Tutorials/master/tutorials/example-guide/img/setup.png)');
    expect(result).toContain('[Download](https://github.com/sap-tutorials/Tutorials/blob/master/tutorials/example-guide/img/file.json)');
    expect(result).toContain(code);
    expect(result.endsWith('[OPTION END]')).toBe(false);
  });

  it('uses the verified GitHub fallback for the unpublished transport overview', () => {
    expect(tutorialUrl('btp-transport-management-cpi-01-use-case')).toMatch(/github\.com\/sap-tutorials\/Tutorials\/blob\/master\/tutorials\/.+\.md$/);
  });

  for (const [group, config] of Object.entries(TUTORIALS.groups)) {
    for (const id of config.tutorials) {
      it(`preserves code, prerequisites and provenance for ${id}`, () => {
        const raw = readFileSync(`sources/sap-tutorials/tutorials/${id}/${id}.md`, 'utf8');
        const generated = readFileSync(`sources/tutorials-generated/${group}/${id}.md`, 'utf8');
        const parsed = matter(generated);
        expect(parsed.data.title).toContain(config.name);
        expect(parsed.data.description.length).toBeGreaterThan(10);
        expect(generated).toContain(`**URL:** ${tutorialUrl(id)}`);
        expect(generated).toContain('## Prerequisites');
        for (const block of raw.match(/^\s*```[^\n]*\n[\s\S]*?^\s*```\s*$/gm) || []) {
          expect(generated).toContain(block);
        }
        expect(generateDocumentationUrl(`/sap-tutorials-${group}`, `${id}.md`, generated, getDocUrlConfig(`/sap-tutorials-${group}`)!)).toBe(tutorialUrl(id));
      });
    }
  }
});
