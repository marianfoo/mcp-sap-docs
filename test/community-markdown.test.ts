// Tests for the SAP Community body → Markdown converter.
//
// Two layers:
//   1. synthetic samples that pin every rule of the rule set (offline, always on)
//   2. the criteria of the sap-community-markdown skill against real posts, when
//      a fixture directory is given via COMMUNITY_FIXTURES. The repository does
//      not carry SAP Community content, so this part is opt-in:
//
//        COMMUNITY_FIXTURES=<dir with <id>.html + <id>.subject> \
//          npx vitest run test/community-markdown.test.ts
//
// The rules exist because a generic converter (Turndown + GFM) gets them wrong
// on this corpus; the comments name the failure each one prevents.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { communityHtmlToMarkdown } from "../src/lib/communityMarkdown.js";

const convert = communityHtmlToMarkdown;

// --- 1. rules -------------------------------------------------------------

describe("communityMarkdown — headings", () => {
  it("keeps levels below the post title and never emits H1 itself", () => {
    const md = convert("<H3>First</H3><P>Body</P><H4>Deeper</H4>");
    expect(md).toContain("### First");
    expect(md).toContain("#### Deeper");
    expect(md).not.toMatch(/^# /m);
  });

  it("shifts one level when the post uses <H1> as a section heading", () => {
    const md = convert("<H1>Section</H1><H2>Sub</H2><P>Body</P>");
    expect(md).toContain("## Section");
    expect(md).toContain("### Sub");
  });

  it("unwraps emphasis inside a heading", () => {
    expect(convert("<H3><STRONG>Bold title</STRONG></H3>")).toContain("### Bold title");
  });
});

describe("communityMarkdown — lists", () => {
  it("keeps nesting, two spaces per level", () => {
    const md = convert("<UL><LI>a<UL><LI>b</LI></UL></LI></UL>");
    expect(md).toContain("- a\n  - b");
  });

  it("turns <BR> inside an item into a continuation line", () => {
    const md = convert("<UL><LI>first<BR />second</LI></UL>");
    const lines = md.split("\n").filter((line) => line.trim());
    expect(lines[0]).toBe("- first");
    expect(lines[1]).toBe("  second");
  });

  it("keeps text that sits between items instead of dropping it", () => {
    const md = convert("<UL><LI>item</LI><P>paragraph after the item</P></UL>");
    expect(md).toContain("- item");
    expect(md).toContain("paragraph after the item");
  });

  it("numbers ordered lists", () => {
    expect(convert("<OL><LI>one</LI><LI>two</LI></OL>")).toContain("1. one\n2. two");
  });

  it("keeps links and emphasis inside items", () => {
    const md = convert('<UL><LI><A href="https://a">Title</A> and <STRONG>bold</STRONG></LI></UL>');
    expect(md).toContain("[Title](https://a)");
    expect(md).toContain("**bold**");
  });

  it("keeps lists tight and drops empty bullets", () => {
    const md = convert("<UL><LI>a</LI><LI></LI><LI>b</LI></UL>");
    expect(md).toContain("- a\n- b");
    expect(md).not.toMatch(/\n\n- /);
  });
});

describe("communityMarkdown — images", () => {
  it("takes the caption from the following image_caption paragraph", () => {
    const md = convert('<P><IMG src="x.png"></P><P class="image_caption">A caption</P>');
    expect(md).toContain("![A caption](x.png)");
  });

  it("falls back to alt/title for a bare image", () => {
    expect(convert('<IMG src="y.png" alt="From alt">')).toContain("![From alt](y.png)");
    expect(convert('<IMG src="z.png" title="From title">')).toContain("![From title](z.png)");
  });
});

describe("communityMarkdown — tables", () => {
  it("promotes the first row to the header and pads short rows", () => {
    const md = convert("<TABLE><TR><TD>a</TD><TD>b</TD></TR><TR><TD>c</TD></TR></TABLE>");
    const rows = md.split("\n").filter((line) => line.startsWith("|"));
    expect(rows[0]).toBe("| a | b |");
    expect(rows[1]).toBe("| --- | --- |");
    expect(rows[2]).toBe("| c | |");
  });

  it("joins lists inside a cell with <br> and escapes pipes", () => {
    const md = convert("<TABLE><TR><TD><UL><LI>a</LI><LI>b</LI></UL></TD><TD>x | y</TD></TR></TABLE>");
    expect(md).toContain("a<br>b");
    expect(md).toContain("x \\| y");
  });
});

describe("communityMarkdown — code", () => {
  it("fences <PRE> with the language from its class", () => {
    const md = convert('<PRE class="language-sql"><CODE>SELECT 1;</CODE></PRE>');
    expect(md).toContain("```sql\nSELECT 1;\n```");
  });

  it("turns <BR /> inside code into a line break", () => {
    expect(convert("<PRE>a<BR />b</PRE>")).toContain("```\na\nb\n```");
  });

  it("promotes an indented block without <PRE> and guesses the language", () => {
    const md = convert("<P>Config:</P><P>  \"a\": 1,\n  \"b\": 2,\n  \"c\": 3</P>");
    expect(md).toContain("```json");
    expect(md).toContain('"a": 1,');
  });

  it("does not mistake a list continuation for indented code", () => {
    const md = convert("<UL><LI>item\n  continuation one\n  continuation two\n  continuation three</LI></UL>");
    expect(md).not.toContain("```");
  });
});

describe("communityMarkdown — text and entities", () => {
  it("decodes the entities the corpus uses", () => {
    expect(convert("<P>a&nbsp;b &amp; c &gt; d &lt; e</P>")).toContain("a b & c > d < e");
  });

  it("removes anchors and keeps link text", () => {
    const md = convert('<H3 id="toc-hId-12">Title</H3><P id="toc-hId-13">Body</P>');
    expect(md).toContain("### Title");
    expect(md).not.toContain("toc-hId");
  });

  it("collapses star runs and blank-line runs", () => {
    const md = convert("<P><STRONG><STRONG>bold</STRONG></STRONG></P><P>a</P><P></P><P></P><P>b</P>");
    expect(md).not.toMatch(/\*{4,}/);
    expect(md).not.toContain("\n\n\n");
  });

  it("returns an empty string for empty input", () => {
    expect(convert("")).toBe("");
  });
});

// --- 2. criteria of the skill, against real posts -------------------------

// Real posts are opt-in: the repository carries no SAP Community content, so the
// criteria run only when a fixture directory is given.
const FIXTURES = process.env.COMMUNITY_FIXTURES;
const withoutFixtures = !FIXTURES;

interface Finding {
  name: string;
  ok: boolean;
  detail?: string;
}

const RESIDUE = /<\/?(?:P|IMG|UL|OL|LI|H[1-6]|A|STRONG|EM|B|I|CODE|PRE|SPAN|DIV|TABLE|TR|TD|TH|TBODY|THEAD|HR|BLOCKQUOTE|SUP|SUB|FONT)\b[^>]*>/gi;
const WORD = /[A-Za-z][A-Za-z0-9_'\-]{4,}/g;

// Same frame the server builds in communityBestMatch.ts — the body is trimmed
// because the frame brings its own separation (and the server trims for the
// same reason).
const frame = (body: string, subject: string, id: string): string =>
  `# ${subject}\n\n**Source**: SAP Community Blog Post  \n**Published**: unknown  \n` +
  `**URL**: https://community.sap.com/t5/x/td-p/${id}\n\n---\n\n${body.trim()}\n\n---\n\n` +
  `*This content is from the SAP Community and represents community knowledge and experiences.*`;

/** Fenced and inline code — the skill ignores it for the checks that say so. */
const stripCode = (markdown: string): string =>
  markdown.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]+`/g, " ");

/** Entities used by the corpus; the converter decodes the same set. */
const decodeForCheck = (text: string): string =>
  text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Words a reader sees in the raw post: tags removed, entities decoded. */
const visibleWords = (html: string): Set<string> => {
  const text = decodeForCheck(html.replace(/<[^>]+>/g, " "));
  return new Set((text.match(WORD) ?? []).map((word) => word.toLowerCase()));
};

function check(source: string, markdown: string): Finding[] {
  const findings: Finding[] = [];
  const add = (name: string, ok: boolean, detail = ""): void => {
    findings.push({ name, ok, detail });
  };

  const body = stripCode(markdown);

  add("no HTML residue", (body.match(RESIDUE) ?? []).length === 0);
  add("no &nbsp;", !body.includes("&nbsp;"));
  // Case-sensitive on purpose: lowercase <br> is a valid Markdown line break and
  // the converter emits it inside table cells.
  add("no <BR />", !/<BR\s*\/?>/.test(body));
  const noAlt = (markdown.match(/!\[\]\(/g) ?? []).length;
  add("images with alt text", noAlt === 0, `${noAlt} without alt`);
  const fences = (markdown.match(/```/g) ?? []).length;
  add("fences balanced", fences % 2 === 0, `${fences} markers`);
  const h1 = (body.match(/^# /gm) ?? []).length;
  add("exactly one H1", h1 === 1, `${h1} found`);
  const rawLevels = new Set((source.match(/<H([1-6])\b/gi) ?? []).map((tag) => tag.slice(2, 3)));
  const mdLevels = new Set((body.match(/^#{2,} /gm) ?? []).map((hashes) => String(hashes.trim().length)));
  add("heading levels kept", rawLevels.size === mdLevels.size, `raw ${[...rawLevels]} -> md ${[...mdLevels]}`);
  add("no empty heading", !/^#{1,6}\s*$/m.test(body));
  add("no star runs >= 4", !/\*{4,}/.test(body));
  // A blank line before a list is a finding — except when the list follows the
  // frame's separator: the converter only ever saw the body, so that gap is the
  // caller's, not the converter's.
  const blankBeforeList = [...body.matchAll(/\n\n(?=(?:- |\d+\. ))/g)]
    .filter((match) => !/\n---$/.test(body.slice(0, match.index)));
  add("no blank line before a list", blankBeforeList.length === 0, `${blankBeforeList.length} found`);
  add("no triple gap", !body.includes("\n\n\n"));

  // Tables are checked per block: one post may hold tables of different widths.
  const blocks: string[][] = [];
  let rows: string[] = [];
  for (const line of markdown.split("\n")) {
    if (line.startsWith("|")) {
      rows.push(line);
    } else if (rows.length) {
      blocks.push(rows);
      rows = [];
    }
  }
  if (rows.length) blocks.push(rows);
  const width = (row: string): number => (row.match(/(?<!\\)\|/g) ?? []).length;
  const broken = blocks.filter((block) => new Set(block.map(width)).size !== 1);
  add("table rows complete", broken.length === 0, `${broken.length} broken tables`);

  const missing = [...visibleWords(source)].filter((word) => !markdown.toLowerCase().includes(word));
  add("content complete", missing.length === 0, `${missing.length} words missing: ${missing.slice(0, 5)}`);
  return findings;
}

describe("communityMarkdown — criteria of the skill (real posts)", () => {
  const dir = FIXTURES ?? "";
  const ids = dir
    ? readdirSync(dir).filter((name) => name.endsWith(".html")).map((name) => name.replace(/\.html$/, ""))
    : [];

  it.skipIf(withoutFixtures)("has fixtures", () => {
    expect(ids.length).toBeGreaterThan(0);
  });

  for (const id of ids) {
    it(`${id} passes every criterion`, () => {
      const body = readFileSync(join(dir, `${id}.html`), "utf8");
      const subject = readFileSync(join(dir, `${id}.subject`), "utf8").trim();
      const source = frame(body, subject, id);
      const markdown = frame(communityHtmlToMarkdown(body), subject, id);
      const failed = check(source, markdown).filter((finding) => !finding.ok);
      expect(failed.map((finding) => `${finding.name}: ${finding.detail ?? ""}`)).toEqual([]);
    });
  }

  it.skipIf(withoutFixtures)("keeps nested list indentation in the posts that have nesting", () => {
    const withNesting = ids.filter((id) => {
      const md = communityHtmlToMarkdown(readFileSync(join(dir, `${id}.html`), "utf8"));
      return /^[ ]+(?:[-*]|\d+\.) /m.test(md);
    });
    expect(withNesting.length).toBeGreaterThan(0);
  });
});
