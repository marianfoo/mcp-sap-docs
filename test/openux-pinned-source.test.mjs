import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { materializeOpenUxGeneratedSources, OPENUX_GENERATED_SOURCES } from '../dist/scripts/materialize-openux-generated.js';

// Run after checking out sources/open-ux-tools at the superproject's recorded pin.
test('the recorded Open UX source contains and materializes every configured input', async () => {
  const pin = execFileSync('git', ['rev-parse', 'HEAD:sources/open-ux-tools'], { encoding: 'utf8' }).trim();
  const checkedOut = execFileSync('git', ['-C', 'sources/open-ux-tools', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(checkedOut, pin, 'validate the recorded source pin, not an uncommitted checkout');
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'openux-pinned-'));
  try {
    const result = await materializeOpenUxGeneratedSources({ outputRoot });
    assert.ok(result.filesWritten > 0);
    for (const source of OPENUX_GENERATED_SOURCES) {
      const files = await readdir(path.join(outputRoot, source.outputDir));
      const documents = await Promise.all(files.map(file => readFile(path.join(outputRoot, source.outputDir, file), 'utf8')));
      for (const input of source.inputFiles) {
        assert.ok(documents.some(doc => doc.includes(`**Open UX Source:** ${input}\n`)), `${source.libraryId}: missing ${input}`);
      }
      assert.ok(documents.every(doc => doc.includes(`/blob/${pin}/`)), 'source URLs use the checked-out commit');
    }
  } finally { await rm(outputRoot, { recursive: true, force: true }); }
});
