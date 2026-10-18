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

  it('preserves placeholders, generic types, autolinks and inline code', () => {
    expect(markdownDescription('Replace <subdomain> in <b>the URL</b> with your subaccount.'))
      .toBe('Replace <subdomain> in the URL with your subaccount.');
    expect(markdownDescription('Use Controller<View>, `<div>` and <https://example.com>.'))
      .toBe('Use Controller<View>, `<div>` and <https://example.com>.');
  });

  it('skips SAP stylesheet links before the description', () => {
    expect(markdownDescription('<!-- loio123 -->\n<link rel="stylesheet" href="css/sap-icons.css"/>\n# Update\nThis release adds new controls.'))
      .toBe('This release adds new controls.');
  });

  it('preserves inline script/style examples and skips HTML code blocks', () => {
    expect(markdownDescription('# Bootstrap\nThe bootstrap `<script>` tag loads UI5.\n```html\n<script src="x"></script>\n```'))
      .toBe('The bootstrap `<script>` tag loads UI5.');
    expect(markdownDescription('Use `<style>` for CSS.\n<style>body { color: red }</style>'))
      .toBe('Use `<style>` for CSS.');
    expect(markdownDescription('<pre><code>const example = true;</code></pre>\nThe service connects applications.'))
      .toBe('The service connects applications.');
  });

  it('keeps word boundaries at block tags without splitting inline formatting', () => {
    expect(markdownDescription('<p>First</p><p>second<br>third</p>')).toBe('First second third');
    expect(markdownDescription('<td>Name</td><td>Value</td>')).toBe('Name Value');
    expect(markdownDescription('re<b>use</b> the <em>same</em> service.')).toBe('reuse the same service.');
    expect(markdownDescription('Use  `<div>  text</div>`  as an example.')).toBe('Use `<div>  text</div>` as an example.');
  });

  it('skips badges and Markdown container markers', () => {
    expect(markdownDescription('[![build](badge.svg)](ci)\n::: tip\n{{ $frontmatter.synopsis }}\nMeaningful prose.'))
      .toBe('Meaningful prose.');
  });

  it('preserves Markdown prose, handles CRLF, and bounds the fallback', () => {
    expect(markdownDescription('# Page\r\n\r\nUse **CAP** and [CDS](cds.md).')).toBe('Use **CAP** and [CDS](cds.md).');
    expect(markdownDescription('A'.repeat(500))).toHaveLength(400);
    expect(markdownDescription('<!-- hidden -->\n<a id="anchor"></a>\n# Heading')).toBe('');
  });
});
