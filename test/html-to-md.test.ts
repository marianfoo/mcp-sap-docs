import { describe, it, expect } from "vitest";
import { htmlToMarkdown, legacyHtmlToMarkdown } from "../src/lib/htmlToMarkdown.js";

// Pure-function tests — no network.
//
// The first group is the *reason* we switched: each case asserts the Turndown output AND
// the matching deficiency in the old regex converter (`legacyHtmlToMarkdown`), so the suite
// doubles as documentation of the fidelity gain. Only genuine improvements are contrasted —
// headings and inline `<code>` are NOT here because legacy already handled them.
describe("htmlToMarkdown — improvements over the legacy regex converter", () => {
  it("renders <table> as a GFM pipe table; legacy concatenated the cells", () => {
    const html = `<table><thead><tr><th>Transaction</th><th>Description</th></tr></thead>
      <tbody><tr><td>VA01</td><td>Create Sales Order</td></tr></tbody></table>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain("| Transaction | Description |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| VA01 | Create Sales Order |");
    // Legacy has no table support: it strips the tags and runs cells together ("VA01Create…").
    const legacy = legacyHtmlToMarkdown(html);
    expect(legacy).not.toContain("|");
    expect(legacy).toContain("VA01Create Sales Order");
  });

  it("preserves nested list structure; legacy flattened it onto one line", () => {
    const html = `<ul><li>Parent<ul><li>Child</li></ul></li></ul>`;
    const md = htmlToMarkdown(html);
    expect(md).toMatch(/-\s+Parent/);
    expect(md).toMatch(/\n\s+-\s+Child/); // child indented under parent
    // Legacy emits bullets with no nesting and no line breaks: "• Parent• Child".
    expect(legacyHtmlToMarkdown(html)).toBe("• Parent• Child");
  });

  it("decodes HTML entities in code; legacy left them raw", () => {
    const html = `<pre class="codeblock">SELECT * FROM mara WHERE matnr &lt; '100' &amp; ok</pre>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain("```");
    expect(md).toContain("matnr < '100' & ok"); // &lt; / &amp; decoded
    expect(md).not.toContain("&lt;");
    // Legacy strips tags but never decodes entities — raw "&lt;"/"&amp;" leak into the output.
    expect(legacyHtmlToMarkdown(html)).toContain("&lt;");
  });

  it("keeps emphasis; legacy dropped it to plain text", () => {
    const html = `<p>You should <strong>avoid</strong> MOVE.</p>`;
    expect(htmlToMarkdown(html)).toContain("**avoid**");
    expect(legacyHtmlToMarkdown(html)).not.toContain("**"); // legacy → "You should avoid MOVE."
  });
});

// Correctness + edge cases (not necessarily improvements over legacy).
describe("htmlToMarkdown — conversion behaviour", () => {
  it("keeps a table row on one line when a cell contains block elements", () => {
    const html = `<table><tr><th>Code</th><th>Name</th></tr>
      <tr><td><p>VA03</p></td><td>Display Sales Order</td></tr></table>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain("| VA03 | Display Sales Order |");
    // No data row should start with "|" yet fail to end with "|".
    const rows = md.split("\n").filter((l) => l.trim().startsWith("|"));
    for (const row of rows) expect(row.trim().endsWith("|")).toBe(true);
  });

  it("converts headings and inline code", () => {
    const md = htmlToMarkdown(`<h2>Overview</h2><p>Use <code>NEW</code>.</p>`);
    expect(md).toContain("## Overview");
    expect(md).toContain("`NEW`");
  });

  it("returns empty string for empty input", () => {
    expect(htmlToMarkdown("")).toBe("");
  });

  // The following pin the combined-`gfm` behaviours. They don't appear in SAP Help bodies
  // today, but this is a general converter — guard them in case other sources are added.
  it("language-tags a div.highlight code block without double-fencing", () => {
    const html = `<div class="highlight-source-js"><pre>const x = 1;</pre></div>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain("```js");
    expect(md).toContain("const x = 1;");
    // Exactly one opening+closing fence pair — our bare-<pre> rule must not also fire here.
    expect((md.match(/```/g) || []).length).toBe(2);
  });

  it("still fences a bare <pre> when there is no highlight wrapper", () => {
    expect(htmlToMarkdown(`<pre>plain code</pre>`)).toContain("```\nplain code\n```");
  });

  it("renders strikethrough", () => {
    expect(htmlToMarkdown(`<p><del>old</del> new</p>`)).toContain("~old~");
  });
});
