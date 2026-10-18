import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeDb, openDb, searchFTS, toMatchQuery } from '../src/lib/searchDb.js';
import { FTS_SCHEMA } from '../src/lib/searchSchema.js';
import { expandQueryTerms } from '../src/lib/metadata.js';
import { detectQueryContexts, hasCleanCodeIntent } from '../src/lib/search.js';

const directory = mkdtempSync(path.join(tmpdir(), 'sap-search-'));

beforeAll(() => {
  const filename = path.join(directory, 'fixture.sqlite');
  const db = new Database(filename);
  db.exec(FTS_SCHEMA);
  const insert = db.prepare('INSERT INTO docs VALUES (?,?,?,?,?,?,?,?,?,?)');
  insert.run('/fixture', 'markdown', 'zircon', 'neutral', '', '', '', '/fixture/title', 'title.md', 0);
  insert.run('/fixture', 'markdown', 'neutral', 'zircon', '', '', '', '/fixture/description', 'description.md', 0);
  insert.run('/fixture', 'zircon', 'neutral', 'markdown', '', '', '', '/fixture/type', 'type.md', 0);
  insert.run('/abap', 'markdown', 'AUTHORITY-CHECK', 'authorization check', '', '', '', '/abap/auth', 'auth.md', 0);
  insert.run('/ui5', 'markdown', 'sap.m.Button', 'enabled property', '', '', '', '/ui5/button', 'button.md', 0);
  insert.run('/abap', 'markdown', 'line_exists', 'predicate function', '', '', '', '/abap/exists', 'exists.md', 0);
  insert.run('/fixture', 'markdown', 'Überprüfung', 'Unicode title', '', '', '', '/fixture/unicode', 'unicode.md', 0);
  insert.run('/ui5', 'markdown', 'Separated words', 'enabled other property', '', '', '', '/ui5/separated', 'separated.md', 0);
  db.close();
  closeDb();
  openDb(filename);
});

afterAll(() => {
  closeDb();
  rmSync(directory, { recursive: true, force: true });
});

describe('lexical retrieval', () => {
  it('weights the title ahead of description and document-type metadata', () => {
    expect(searchFTS('zircon').map(row => row.id)).toEqual([
      '/fixture/title', '/fixture/description', '/fixture/type',
    ]);
  });

  it.each([
    ['AUTHORITY-CHECK', '/abap/auth'],
    ['`AUTHORITY-CHECK`', '/abap/auth'],
    ['sap.m.Button', '/ui5/button'],
    ['line_exists', '/abap/exists'],
    ['Überprüfung', '/fixture/unicode'],
  ])('retrieves the technical term %s without joining its tokens', (query, expected) => {
    expect(searchFTS(query)[0]?.id).toBe(expected);
  });

  it('keeps quoted phrases and source filters effective', () => {
    expect(toMatchQuery('"enabled property"')).toBe('"enabled property"');
    expect(searchFTS('"enabled property"', { libraries: ['/ui5'] }).map(row => row.id)).toEqual(['/ui5/button']);
    expect(searchFTS('"enabled property"', { libraries: ['/abap'] })).toEqual([]);
  });

  it('ignores punctuation-only input and does not expose FTS operators', () => {
    expect(toMatchQuery('+-()')).toBe('');
    expect(toMatchQuery('AUTHORITY-CHECK')).toBe('"authority check"*');
    expect(toMatchQuery('sap.m.Button')).toBe('"sap m button"');
    expect(toMatchQuery('a".b')).toBe('"a b"');
    expect(toMatchQuery('NEAR(x y)')).toBe('"near x"* OR "y"*');
    expect(toMatchQuery('^x')).toBe('"x"*');
    expect(toMatchQuery('{title}:x')).toBe('"title x"*');
    expect(toMatchQuery('"where"')).toBe('"where"');
    expect(searchFTS('title:zircon')).toEqual([]);
    const warning = vi.spyOn(console, 'warn');
    try {
      expect(searchFTS('a".b')).toEqual([]);
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });
});

describe('query meaning', () => {
  it('expands complete acronyms without corrupting ordinary words', () => {
    expect(expandQueryTerms('a row exists')).toEqual(['a row exists']);
    expect(expandQueryTerms('wrap an error')).toEqual(['wrap an error']);
    expect(expandQueryTerms('überTS')).toEqual(['überTS']);
    expect(expandQueryTerms('TS example')).toContain('TypeScript example');
    expect(expandQueryTerms('TS and ts')).toContain('TypeScript and TypeScript');
    expect(expandQueryTerms('RAP behavior')).toContain('restful application programming behavior');
  });

  it.each(['internal table key', 'internal tables', 'itab key', 'ABAP table'])('recognizes %s as ABAP', query => {
    const contexts = detectQueryContexts(query);
    expect(contexts).toContain('abap');
    expect(contexts).not.toContain('ui5');
  });

  it('retains explicit frontend context, including mixed-domain questions', () => {
    expect(detectQueryContexts('UI5 table')).toContain('ui5');
    expect(detectQueryContexts('Fiori Tools deployment')).toContain('ui5 tooling');
    expect(detectQueryContexts('wdi5 table selection')).toEqual(expect.arrayContaining(['ui5', 'wdi5']));
    expect(detectQueryContexts('UI5 render an ABAP internal table')).toEqual(expect.arrayContaining(['ui5', 'abap']));
  });

  it('does not interpret generic backend vocabulary as a UI5 request', () => {
    for (const query of ['CAP view input parameters', 'ABAP control flow', 'internal table sample', 'table totals']) {
      expect(detectQueryContexts(query)).not.toContain('ui5');
    }
  });

  it('recognizes coding preferences without promoting style guides for unrelated recommendations', () => {
    for (const query of ['clean code', 'Clean ABAP', 'coding standard', 'should I declare variables here', 'better to use classes', 'recommended ABAP method design', 'ABAP naming conventions', 'coding standards', 'style guides']) {
      expect(hasCleanCodeIntent(query)).toBe(true);
    }
    for (const query of ['recommended BTP region', 'better UI5 theme', 'should I use this destination', 'ABAP method syntax', 'recommended TypeScript class design', 'better CAP service method', 'Python clean code', 'Fiori elements best practices', 'Fiori tools naming conventions', 'recommended ABAP environment on BTP', 'Which function module should I call to create a sales order?', 'Which method should I call to refresh a sap.m.Table binding?', 'Which HTTP status code should my CAP handler return?']) {
      expect(hasCleanCodeIntent(query)).toBe(false);
    }
  });
});
