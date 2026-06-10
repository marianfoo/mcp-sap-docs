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
