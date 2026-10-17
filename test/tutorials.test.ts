import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import matter from 'gray-matter';
import { TUTORIALS, materializeTutorials, normalizeTutorialMarkdown, tutorialUrl } from '../scripts/materialize-tutorials.js';
import { generateDocumentationUrl } from '../src/lib/url-generation/index.js';
import { getDocUrlConfig } from '../src/lib/metadata.js';

const selected = Object.values(TUTORIALS.groups).flatMap(group => group.tutorials);

describe('curated SAP tutorials', () => {
  let outputRoot: string;
  let sourceFiles: Set<string>;
  beforeAll(async () => {
    outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sap-tutorials-test-'));
    await materializeTutorials('sources/sap-tutorials/tutorials', outputRoot);
    sourceFiles = new Set(execFileSync('git', ['-C', 'sources/sap-tutorials', 'ls-tree', '-r', '--name-only', '-z', 'HEAD'], {
      encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    }).split('\0').filter(Boolean));
  });
  afterAll(async () => { if (outputRoot) await fs.rm(outputRoot, { recursive: true, force: true }); });

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

  it('corrects the upstream Bruno collection filename without changing code', () => {
    const result = normalizeTutorialMarkdown('[Collection](img/Bruno_Collection.json)', 'ai-core-orchestration-consumption-v2');
    expect(result).toContain('/img/bruno_config.json)');
  });

  it('removes stale generated files when the tutorial checkout is absent', async () => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'sap-tutorials-missing-'));
    try {
      const output = path.join(temporary, 'output');
      await fs.mkdir(output);
      await fs.writeFile(path.join(output, 'stale.md'), 'Stale tutorial');
      await materializeTutorials(path.join(temporary, 'missing'), output);
      expect(existsSync(output)).toBe(false);
    } finally { await fs.rm(temporary, { recursive: true, force: true }); }
  });

  for (const [group, config] of Object.entries(TUTORIALS.groups)) {
    for (const id of config.tutorials) {
      it(`preserves code, prerequisites and provenance for ${id}`, () => {
        const raw = readFileSync(`sources/sap-tutorials/tutorials/${id}/${id}.md`, 'utf8');
        const generated = readFileSync(path.join(outputRoot, group, `${id}.md`), 'utf8');
        const parsed = matter(generated);
        expect(parsed.data.title).toContain(config.name);
        expect(parsed.data.description.length).toBeGreaterThan(10);
        expect(generated).toContain(`**URL:** ${tutorialUrl(id)}`);
        expect(generated).toContain('## Prerequisites');
        // Compare with Git's case-sensitive tree, even on a case-insensitive host.
        for (const match of generated.matchAll(/https:\/\/(?:github\.com\/sap-tutorials\/Tutorials\/blob|raw\.githubusercontent\.com\/sap-tutorials\/Tutorials)\/master\/[^\s)]+/g)) {
          const file = decodeURIComponent(new URL(match[0]).pathname.split('/master/')[1]);
          expect(sourceFiles.has(file), `${id}: missing source link ${file}`).toBe(true);
        }
        for (const block of raw.match(/^\s*```[^\n]*\n[\s\S]*?^\s*```\s*$/gm) || []) {
          expect(generated).toContain(block);
        }
        expect(generateDocumentationUrl(`/sap-tutorials-${group}`, `${id}.md`, generated, getDocUrlConfig(`/sap-tutorials-${group}`)!)).toBe(tutorialUrl(id));
      });
    }
  }
});
