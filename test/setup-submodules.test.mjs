import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const setup = new URL('../setup.sh', import.meta.url);
const skill = 'packages/fiori-docs-embeddings/data_local/skills_copy/sap-fiori-opa5-test-development/SKILL.md';
const nestedPath = 'packages/create/example';

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sap-docs-setup-'));
  const root = path.join(dir, 'consumer');
  const source = path.join(dir, 'upstream');
  const nested = path.join(dir, 'nested');
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(dir, 'gitconfig'),
    GIT_ALLOW_PROTOCOL: 'file', GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'Setup Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Setup Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
    MCP_VARIANT: 'sap-docs', SKIP_NESTED_SUBMODULES: '',
  };
  writeFileSync(env.GIT_CONFIG_GLOBAL, '[commit]\n\tgpgsign = false\n');
  // Git and Bash are real. Only package installation/build and PM2 are stubbed.
  for (const name of ['npm', 'pm2']) {
    writeFileSync(path.join(bin, name), '#!/bin/sh\nexit 0\n');
    chmodSync(path.join(bin, name), 0o755);
  }
  function run(command, args, cwd = root, overrides = {}) {
    const result = spawnSync(command, args, { cwd, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 60000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    return result.stdout.trim();
  }
  const git = (cwd, ...args) => run('git', args, cwd);
  const write = (cwd, file, text) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), text);
  };
  const commit = (cwd, message) => {
    git(cwd, 'add', '--ignore-removal', '.');
    git(cwd, 'commit', '-qm', message);
    return git(cwd, 'rev-parse', 'HEAD');
  };
  for (const repo of [root, source, nested]) {
    mkdirSync(repo);
    git(repo, 'init', '-q', '-b', 'main');
  }
  write(nested, 'README.md', 'Pinned nested documentation\n');
  const nestedPin = commit(nested, 'Nested pin');
  write(nested, 'README.md', 'Newer nested documentation\n');
  commit(nested, 'Newer nested tip');
  write(source, 'packages/fiori-docs-embeddings/data_local/opa5_docu.md', 'Old documentation\n');
  const oldPin = commit(source, 'Old layout');
  write(source, skill, '# Current OPA5 skill\n');
  write(source, 'unneeded/large-source.txt', 'Outside the sparse checkout\n');
  write(source, '.gitmodules', `[submodule "example"]\n path = ${nestedPath}\n url = ${pathToFileURL(nested).href}\n`);
  git(source, 'update-index', '--add', '--cacheinfo', `160000,${nestedPin},${nestedPath}`);
  const tip = commit(source, 'Current layout with nested dependency');
  const sourceUrl = pathToFileURL(source).href;
  write(root, '.gitmodules', ['open-ux-tools', 'excluded'].map(name =>
    `[submodule "sources/${name}"]\n path = sources/${name}\n url = ${sourceUrl}\n branch = main\n`).join(''));
  for (const name of ['open-ux-tools', 'excluded']) {
    git(root, 'update-index', '--add', '--cacheinfo', `160000,${oldPin},sources/${name}`);
  }
  for (const [variant, name] of [['sap-docs', 'open-ux-tools'], ['abap', 'excluded']]) {
    write(root, `config/variants/${variant}.json`, JSON.stringify({
      submodulePaths: [`sources/${name}`], tools: { ui5LibDiff: false }, server: {},
    }));
  }
  write(root, '.mcp-variant', 'sap-docs\n');
  copyFileSync(setup, path.join(root, 'setup.sh'));
  commit(root, 'Consumer pins the old layout');
  return { root, source, oldPin, nestedPin, tip, git, write, commit,
    setup: (overrides = {}) => run('bash', ['setup.sh'], root, overrides),
    close: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('fresh setup keeps the fetched source tip and initializes only its pinned nested dependencies', () => {
  const f = fixture();
  try {
    f.setup();
    const source = path.join(f.root, 'sources/open-ux-tools');
    assert.equal(f.git(source, 'rev-parse', 'HEAD'), f.tip);
    assert.ok(existsSync(path.join(source, skill)));
    assert.equal(f.git(path.join(source, nestedPath), 'rev-parse', 'HEAD'), f.nestedPin);
    assert.ok(!existsSync(path.join(source, 'unneeded/large-source.txt')));
    assert.ok(!existsSync(path.join(f.root, 'sources/excluded/.git')));
  } finally { f.close(); }
});

test('setup upgrades an old pinned checkout and repeated setup follows the next source tip', () => {
  const f = fixture();
  try {
    f.git(f.root, 'submodule', 'update', '--init', '--depth', '1', '--', 'sources/open-ux-tools');
    const source = path.join(f.root, 'sources/open-ux-tools');
    assert.equal(f.git(source, 'rev-parse', 'HEAD'), f.oldPin);
    f.setup();
    assert.equal(f.git(source, 'rev-parse', 'HEAD'), f.tip);
    f.write(f.source, skill, '# Updated OPA5 skill\n');
    const next = f.commit(f.source, 'Next source update');
    f.setup();
    assert.equal(f.git(source, 'rev-parse', 'HEAD'), next);
    assert.match(readFileSync(path.join(source, skill), 'utf8'), /Updated OPA5/);
    assert.equal(f.git(path.join(source, nestedPath), 'rev-parse', 'HEAD'), f.nestedPin);
  } finally { f.close(); }
});

test('SKIP_NESTED_SUBMODULES leaves the selected source current without initializing nested repositories', () => {
  const f = fixture();
  try {
    f.setup({ SKIP_NESTED_SUBMODULES: '1' });
    const source = path.join(f.root, 'sources/open-ux-tools');
    assert.equal(f.git(source, 'rev-parse', 'HEAD'), f.tip);
    assert.ok(!existsSync(path.join(source, nestedPath, '.git')));
    assert.ok(!existsSync(path.join(f.root, 'sources/excluded/.git')));
  } finally { f.close(); }
});

test('the ABAP variant only initializes its selected source and nested repositories', () => {
  const f = fixture();
  try {
    f.setup({ MCP_VARIANT: 'abap' });
    const source = path.join(f.root, 'sources/excluded');
    assert.equal(f.git(source, 'rev-parse', 'HEAD'), f.tip);
    assert.equal(f.git(path.join(source, nestedPath), 'rev-parse', 'HEAD'), f.nestedPin);
    assert.ok(!existsSync(path.join(f.root, 'sources/open-ux-tools/.git')));
  } finally { f.close(); }
});
