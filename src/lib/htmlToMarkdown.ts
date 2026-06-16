// HTML → Markdown conversion for fetched SAP Help page bodies.
//
// SAP Help `pagecontent` returns an HTML fragment. The previous hand-rolled regex
// converter (kept below as `legacyHtmlToMarkdown`) dropped tables and flattened nested
// lists — exactly the structure that matters for API/parameter reference pages. Turndown
// handles headings, nested lists, inline/block code and links natively; the `tables` GFM
// plugin adds pipe tables.
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// Configured once and reused for every fetch (the service is stateless per convert call).
const service = new TurndownService({
  headingStyle: "atx",          // "# Heading" — matches the rest of our markdown
  bulletListMarker: "-",
  codeBlockStyle: "fenced",     // ```code``` blocks
  emDelimiter: "_",
  hr: "---",
});

// The combined GFM plugin: pipe tables (the main thing core Turndown can't do) plus
// strikethrough, task lists, and language-tagged `<div class="highlight-*"><pre>` code
// blocks. Tables are what SAP Help needs today; the rest are free and let this general
// converter handle GFM-style HTML if other sources are routed through it later.
service.use(gfm);

// Don't backslash-escape Markdown punctuation in text. Turndown escapes `_ * . # [ ]` etc. so
// they can't be re-parsed as Markdown, but this output is read by an LLM, not re-rendered — and
// the escaping corrupts technical identifiers (`API_TASKPLANNINGELEMENT` → `API\_TASK…`), which
// weaker models then copy verbatim with the stray backslash. The legacy converter never escaped;
// matching that is more faithful. Pipe-escaping inside table cells is done explicitly in the cell
// rule, so tables (and the headerless-table column count) are unaffected.
service.escape = (s: string) => s;

// Override the GFM cell rule: a `<td>`/`<th>` containing block elements (`<p>`, `<div>`)
// converts to content with newlines, which breaks the single-line GFM row. Collapse any
// internal newlines/runs of whitespace to a single space and escape literal pipes. The
// prefix logic mirrors the plugin (first cell in the row opens with "| "). addRule unshifts
// to the front of the rule list, so this takes precedence over the plugin's cell rule.
const cellIndexOf = Array.prototype.indexOf;
service.addRule("tableCellSingleLine", {
  filter: ["th", "td"],
  replacement: (content, node) => {
    const text = content.replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ").replace(/\|/g, "\\|").trim();
    const index = node.parentNode ? cellIndexOf.call(node.parentNode.childNodes, node) : 0;
    return (index === 0 ? "| " : " ") + text + " |";
  },
});

// SAP's DITA pipeline (notably older NetWeaver-era ABAP reference docs) emits tables with
// NO heading row — the first row is plain `<td>` cells inside `<tbody>`, with column labels
// rendered via CSS, not `<th>`/`<thead>`. The gfm plugin only converts tables whose first
// row is a heading row and otherwise `keep()`s the table as RAW HTML (a GFM pipe table is
// invalid without a header). That left big reference tables (e.g. "ABAP System Fields", 178
// rows) as verbose raw HTML — poor fidelity for the LLM and ~10x larger. SAP's reference
// tables almost always use row 0 as the conceptual header, so we promote it: emit the first
// row as the header and inject the separator the plugin omitted.
//
// `isHeadingRow`/`isFirstTbody` mirror the gfm plugin's internal logic verbatim so this rule
// fires exactly on the tables the plugin would otherwise keep as raw HTML — header-bearing
// tables fall through to the plugin's (proven) table rule untouched.
const everyCell = Array.prototype.every;
function isFirstTbody(element: Node): boolean {
  const previousSibling = element.previousSibling;
  return (
    element.nodeName === "TBODY" &&
    (!previousSibling ||
      (previousSibling.nodeName === "THEAD" && /^\s*$/i.test(previousSibling.textContent ?? "")))
  );
}
function isHeadingRow(tr: Node | undefined): boolean {
  if (!tr) return false;
  const parentNode = tr.parentNode;
  if (!parentNode) return false;
  return (
    parentNode.nodeName === "THEAD" ||
    (parentNode.firstChild === tr &&
      (parentNode.nodeName === "TABLE" || isFirstTbody(parentNode)) &&
      everyCell.call(tr.childNodes, (n: Node) => n.nodeName === "TH"))
  );
}
service.addRule("headerlessTable", {
  filter: (node) =>
    node.nodeName === "TABLE" &&
    (node as HTMLTableElement).rows.length > 0 &&
    !isHeadingRow((node as HTMLTableElement).rows[0]),
  replacement: (content) => {
    // `content` is the rows already rendered as "| a | b |" lines by the cell/row rules, but
    // with no separator (the plugin emits the separator only for heading rows). Treat row 0
    // as the header and inject a separator sized to its column count.
    const rows = content.split("\n").filter((l) => l.trim() !== "");
    if (rows.length === 0) return "";
    // Count unescaped pipes in the header row; columns = pipes - 1.
    const cols = (rows[0].match(/(?<!\\)\|/g) || []).length - 1;
    if (cols < 1) return `\n\n${content}\n\n`;
    const separator = `| ${Array(cols).fill("---").join(" | ")} |`;
    return `\n\n${[rows[0], separator, ...rows.slice(1)].join("\n")}\n\n`;
  },
});

// Drop non-content elements outright (their text would otherwise leak into the output).
service.remove(["script", "style", "noscript"]);

// SAP Help marks code samples as bare `<pre class="codeblock">` with no inner `<code>`,
// so Turndown's built-in fenced-code rule (which requires `<pre><code>`) misses them.
// Fence any `<pre>` explicitly, using the DOM's already entity-decoded textContent.
service.addRule("preAsCodeBlock", {
  filter: "pre",
  replacement: (_content, node) => {
    const text = (node.textContent ?? "").replace(/\n+$/, "");
    return `\n\n\`\`\`\n${text}\n\`\`\`\n\n`;
  },
});

/**
 * The original regex-based converter, preserved verbatim. Used as the fallback when
 * Turndown throws on malformed markup, so a conversion failure is never worse than the
 * pre-Turndown behaviour. Also exported for side-by-side A/B comparison.
 */
export function legacyHtmlToMarkdown(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
    .replace(/<h([1-6])[^>]*>/gi, (_, level) => '\n' + '#'.repeat(parseInt(level)) + ' ') // Convert headings
    .replace(/<\/h[1-6]>/gi, '\n') // Close headings
    .replace(/<p[^>]*>/gi, '\n') // Paragraphs
    .replace(/<\/p>/gi, '\n')
    .replace(/<br[^>]*>/gi, '\n') // Line breaks
    .replace(/<li[^>]*>/gi, '• ') // List items
    .replace(/<\/li>/gi, '\n')
    .replace(/<code[^>]*>/gi, '`') // Inline code
    .replace(/<\/code>/gi, '`')
    .replace(/<pre[^>]*>/gi, '\n```\n') // Code blocks
    .replace(/<\/pre>/gi, '\n```\n')
    .replace(/<[^>]+>/g, '') // Remove remaining HTML tags
    .replace(/\s*\n\s*\n\s*/g, '\n\n') // Clean up multiple newlines
    .replace(/^\s+|\s+$/g, '') // Trim
    .trim();
}

/**
 * Convert a SAP Help HTML body fragment to Markdown using Turndown (tables + nested lists
 * preserved). Falls back to the legacy regex converter if Turndown throws, so output is
 * never worse than the prior behaviour.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  try {
    return service.turndown(html).trim();
  } catch {
    return legacyHtmlToMarkdown(html);
  }
}
