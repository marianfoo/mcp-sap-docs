import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { communityHtmlToMarkdown as convert } from "../src/lib/communityMarkdown.js";

// These examples pin information and valid Markdown structure, rather than the
// whitespace choices of a particular converter or parity with a client script.
describe("Community Markdown", () => {
  it("keeps headings below the framed post title", () => {
    expect(convert("<h3>First</h3><h4>Deeper</h4>")).toBe("### First\n\n#### Deeper");
    expect(convert("<h1>Section</h1><h2>Sub</h2>")).toBe("## Section\n\n### Sub");
  });

  it("does not treat escaped technical placeholders as HTML", () => {
    expect(convert("<p>Use &lt;tenant&gt; and &lt;instance number&gt;.</p>"))
      .toBe("Use \\<tenant> and \\<instance number>.");
  });

  it("keeps literal entity examples from being decoded again by Markdown", () => {
    expect(convert("<p>Use &amp;lt;tenant&amp;gt;, &amp;#x41; and &amp;copy; literally.</p>"))
      .toBe("Use \\&lt;tenant\\&gt;, \\&#x41; and \\&copy; literally.");
  });

  it("keeps ordinary paragraphs and blockquotes separate", () => {
    expect(convert("<p>First</p><p>Second</p><blockquote>Quoted</blockquote>"))
      .toBe("First\n\nSecond\n\n> Quoted");
  });

  it("keeps mixed nested lists and text after a child in source order", () => {
    const md = convert("<ol><li>parent<ul><li>child</li></ul>after child</li><li>next</li></ol>");
    expect(md).toMatch(/^1\. +parent\n {4}- +child\n\s*\n {4}after child\n2\. +next$/);
  });

  it("preserves ordered list starts and indents children under multi-digit items", () => {
    const md = convert('<ol start="10"><li>parent<ul><li>child</li></ul></li></ol>');
    expect(md).toMatch(/^10\. +parent\n {5}- +child$/);
  });

  it("preserves line breaks and links inside lists", () => {
    const md = convert('<ul><li>first<br>second <a href="https://example.com">link</a></li></ul>');
    expect(md).toContain("first  \n    second [link](https://example.com)");
  });

  it("uses following image captions and emits their text once", () => {
    const md = convert('<p><img src="x.png" alt="Old alt"></p><p class="image_caption">Useful caption</p>');
    expect(md).toBe("![Useful caption](x.png)");
  });

  it("keeps links and images in rich image captions", () => {
    const md = convert('<p><img src="x.png" alt="Image"></p><p class="image_caption">See <a href="https://example.com">guide</a><img src="detail.png" alt="Detail"></p>');
    expect(md).toContain("![Image](x.png)");
    expect(md).toContain("[guide](https://example.com)");
    expect(md).toContain("![Detail](detail.png)");
  });

  it("preserves alt and title text for images with or without paragraph wrappers", () => {
    expect(convert('<p><img src="x.png" alt="Useful caption"></p>')).toBe("![Useful caption](x.png)");
    expect(convert('<img src="x.png" title="Title">')).toBe("![Title](x.png)");
  });

  it("supports single-quoted attributes and decodes attribute entities once", () => {
    const md = convert("<a href='https://example.com?a=1&amp;b=2'>Link</a><img src='x.png' alt='A &amp; B'>");
    expect(md).toContain("[Link](https://example.com?a=1&b=2)");
    expect(md).toContain("![A & B](x.png)");
  });

  it("escapes image labels and destinations without changing the URL", () => {
    expect(convert('<img src="https://example.com/a(b).png" alt="A [diagram]">'))
      .toBe("![A \\[diagram\\]](https://example.com/a\\(b\\).png)");
  });

  it("creates a header for tables and pads short rows", () => {
    expect(convert("<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>"))
      .toBe("| a | b |\n| --- | --- |\n| c |  |");
  });

  it("keeps text before and after lists in a table cell", () => {
    const md = convert("<table><tr><td><p>before</p><ul><li>item</li></ul><p>after</p></td><td>x | y</td></tr></table>");
    expect(md).toContain("before<br>-   item<br>after");
    expect(md).toContain("x \\| y");
  });

  it("preserves images, links and captions in tables", () => {
    const md = convert('<table><caption>Parameters</caption><tr><td><img src="x.png" alt="Architecture"></td><td><a href="https://example.com">Guide</a></td></tr></table>');
    expect(md).toContain("Parameters\n\n");
    expect(md).toContain("![Architecture](x.png)");
    expect(md).toContain("[Guide](https://example.com)");
  });

  it("keeps multiline code readable inside a table cell", () => {
    const md = convert('<table><tr><td>Code</td></tr><tr><td><pre>  a | b\n&lt;br&gt;</pre></td></tr></table>');
    expect(md).toContain("`  a \\| b`<br>`<br>`");
    expect(md).not.toContain("```");
  });

  it("includes nested table content only once", () => {
    const md = convert('<table><tr><td>Outer<table><tr><td>Inner</td><td>Value</td></tr></table>After</td><td>Neighbor</td></tr></table>');
    for (const word of ["Outer", "Inner", "Value", "After", "Neighbor"]) {
      expect(md.match(new RegExp(word, "g"))).toHaveLength(1);
    }
  });

  it("does not amplify small deeply nested tables into huge output", () => {
    let html = "OnlyOnce";
    for (let depth = 0; depth < 30; depth++) html = `<table><tr><td>${html}</td></tr></table>`;
    const md = convert(html);
    expect(md.match(/OnlyOnce/g)).toHaveLength(1);
    expect(md.length).toBeLessThan(10_000);
  });

  it.each([
    ['<pre class="language-sql"><code>SELECT 1;</code></pre>', '```sql\nSELECT 1;\n```'],
    ['<pre><code class="language-abap">DATA(x) = 1.</code></pre>', '```abap\nDATA(x) = 1.\n```'],
    ['<pre class="language-html">&lt;br&gt;</pre>', '```html\n<br>\n```'],
    ['<pre>a<br>\nb<br>c</pre>', '```\na\nb\nc\n```'],
    ['<pre>&amp;lt;x&amp;gt;</pre>', '```\n&lt;x&gt;\n```'],
  ])("preserves code text and declared languages: %s", (html, expected) => {
    expect(convert(html)).toBe(expected);
  });

  it("uses a fence longer than any embedded backticks", () => {
    expect(convert('<pre class="language-markdown">```js\nconst x = 1;\n```</pre>'))
      .toBe('````markdown\n```js\nconst x = 1;\n```\n````');
  });

  it("keeps inline code spacing and embedded backticks", () => {
    expect(convert("<p>Use <code>a  b</code> and <code>`x`</code></p>"))
      .toBe("Use `a  b` and `` `x` ``");
  });

  it("preserves edge spaces in short and long inline code", () => {
    expect(convert("<code> a </code>")).toBe("`  a  `");
    expect(convert("<code>a </code>")).toBe("`a `");
    const body = " " + "x".repeat(20_000);
    expect(convert(`<code>${body}</code>`)).toBe(`\`${body}\``);
  });

  it("keeps code literal when the editor inserts links or formatting inside it", () => {
    expect(convert('<p><code><a href="https://example.com/profile">@Agent</a>.connect</code>and <code><b>API</b>_TASK</code></p>'))
      .toBe("`@Agent.connect`and `API_TASK`");
  });

  it("does not guess code from indented prose containing punctuation", () => {
    const md = convert("<p>  Note: use a destination;\n  Then: check its settings;\n  Finally: test the connection.</p>");
    expect(md).toBe("Note: use a destination; Then: check its settings; Finally: test the connection.");
  });

  it("handles invalid, uncommon and nested entities without throwing or double decoding", () => {
    expect(convert("<p>&#1114112; &#xD800; &alpha; &amp;lt; &copy;</p>"))
      .toBe("� � α \\&lt; ©");
  });

  it("drops script and style contents while keeping visible text", () => {
    expect(convert("<p>Visible</p><script>doNotDisplay()</script><style>.secret{color:red}</style>"))
      .toBe("Visible");
  });

  it("handles malformed markup using HTML parsing", () => {
    const md = convert("<ul><li>one<li>two</ul><p>after");
    expect(md).toContain("one");
    expect(md).toContain("two");
    expect(md).toContain("after");
  });

  it("keeps nested emphasis valid without changing literal code", () => {
    expect(convert("<strong><strong>bold</strong></strong><code>****literal****</code>"))
      .toBe("**bold**`****literal****`");
  });

  it("has no state shared between conversions", async () => {
    const html = '<p><img src="x.png"></p><p class="image_caption">Caption</p><pre>code</pre>';
    const outputs = await Promise.all(Array.from({length:20}, async () => convert(html)));
    expect(new Set(outputs).size).toBe(1);
    expect(convert("<p>Other post</p>")).toBe("Other post");
  });

  it("returns empty text for empty content", () => {
    expect(convert("")).toBe("");
    expect(convert("<p> </p>")).toBe("");
  });
});

// Optional public-post fixtures stay outside Git. Detailed rendered-content,
// code/link/image retention and latency comparison are recorded in the PR review.
const fixtures = process.env.COMMUNITY_FIXTURES;
if (fixtures) {
  describe("Community Markdown public-post smoke checks", () => {
    const ids = readdirSync(fixtures).filter(name => name.endsWith(".html"));
    it("has fixtures", () => expect(ids.length).toBeGreaterThan(0));
    for (const id of ids) it(id, () => {
      const markdown = convert(readFileSync(join(fixtures, id), "utf8"));
      expect(markdown.trim().length).toBeGreaterThan(0);
      expect(markdown).not.toContain("\u0000");
    });
  });
}
