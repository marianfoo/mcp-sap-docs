import { describe, expect, it } from 'vitest';
import { markdownDescription } from '../scripts/markdown-description.js';

describe('Markdown description fallback', () => {
  it('finds SAP prose after LOIO comments and anchors', () => {
    expect(markdownDescription('<!-- loio123 -->\n\n<a name="loio123"/>\n# Destination Service\n\nConnect applications to remote systems.'))
      .toBe('Connect applications to remote systems.');
  });

  it('removes multiline and inline comments without dropping visible text', () => {
    expect(markdownDescription('<!--\ninternal metadata\n-->\n# Page\nUse <b>destinations</b><!-- internal --> to connect.'))
      .toBe('Use destinations to connect.');
    expect(markdownDescription('<!-- unfinished metadata\nsecret draft')).toBe('');
  });

  it('skips code, headings, images, tables, links and separators before prose', () => {
    expect(markdownDescription('# Page\n![diagram](image.png)\n[ref]: https://example.com\n---\n| A | B |\n```js\nconst irrelevant = true;\n```\n~~~text\nnot a description\n~~~\nThe application connects through a destination.'))
      .toBe('The application connects through a destination.');
  });

  it('does not close a fence on a shorter or different marker', () => {
    expect(markdownDescription('````js\n```\n~~~\ncode\n````\nVisible explanation.')).toBe('Visible explanation.');
  });

  it('skips Vue script blocks, navigation and quoted headings', () => {
    expect(markdownDescription('<script setup>\nimport Badge from "badge.vue"\n</script>\n# Page\n**On this page:**\n- [Overview](#overview)\n> ### Note:\n> Use the destination service.'))
      .toBe('Use the destination service.');
    expect(markdownDescription('Use values < 10 and > 0.')).toBe('Use values < 10 and > 0.');
  });

  it('preserves Markdown prose, handles CRLF, and bounds the fallback', () => {
    expect(markdownDescription('# Page\r\n\r\nUse **CAP** and [CDS](cds.md).')).toBe('Use **CAP** and [CDS](cds.md).');
    expect(markdownDescription('A'.repeat(500))).toHaveLength(400);
    expect(markdownDescription('<!-- hidden -->\n<a id="anchor"></a>\n# Heading')).toBe('');
  });
});
