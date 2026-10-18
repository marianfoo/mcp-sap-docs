// HTML → Markdown for SAP Community post bodies.
//
// The community path used to hand the raw LiQL `body` to the client, so every
// consumer had to deal with the HTML that SAP's editor leaves in a post (the
// `sap-community-markdown` skill does exactly that, in Python). This module
// converts the body server-side instead, so any MCP client gets Markdown.
//
// The rule set mirrors that skill one-to-one, because it was measured against
// this corpus and beats a generic converter (Turndown + GFM) on the criteria
// that matter here:
//   - SAP authors use <H1> as a *section* heading; levels are shifted so the
//     document keeps exactly one H1 — the post title, which the caller frames.
//   - Image captions live in the following <P class="image_caption">, not in
//     alt="…", so <IMG> alone loses the description.
//   - Code languages come from class="language-…" / class="lia-code-sample";
//     the GFM plugin only knows highlight-(text|source)-<lang>.
//   - Blocks that are merely indented (no <PRE>) are code, too.
//   - Lists nest: the boundary of a list is counted, not guessed by a
//     non-greedy regex (which ends at the first </UL> of a nested list and
//     treats everything in between — including whole paragraphs — as items).
//   - <br> inside a table cell is the only way to keep a list readable in a
//     cell, so it is kept deliberately.
//
// What is deliberately NOT here: unwrapping the {"id","text"} envelope and
// handling the truncation notice. Both are the caller's business — the server
// produces the notice itself (see truncate.ts) and frames the content.
//
// No dependencies: the port must stay diffable against the Python source.

// --- patterns -------------------------------------------------------------

/** Between an image and its caption the source has a <BR />. */
const GAP = String.raw`(?:\s|<BR\s*/?>)*`;

const PRE_RE = /<PRE\b[^>]*>([\s\S]*?)<\/PRE>/gi;
const TABLE_RE = /<TABLE\b[^>]*>([\s\S]*?)<\/TABLE>/gi;
const ROW_RE = /<TR\b[^>]*>([\s\S]*?)<\/TR>/gi;
const CELL_RE = /<(TD|TH)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const IMG_RE = new RegExp(
  `<P[^>]*>${GAP}<IMG\\b[^>]*\\bsrc="([^"]+)"[^>]*/?>${GAP}</P>${GAP}` +
    `(?:<P[^>]*class="[^"]*image_caption[^"]*"[^>]*>([\\s\\S]*?)</P>)?`,
  "gi",
);
const IMG_LOOSE_RE = /<img\b[^>]*>/gi;
const ATTR_RE = /(\b[\w-]+)\s*=\s*"([^"]*)"/gi;
const HEAD_RE = /<H([1-6])\b[^>]*>([\s\S]*?)<\/H\1>/gi;
const LINK_RE = /<A\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/A>/gi;
const LIST_BLOCK_RE = /<(OL|UL)\b[^>]*>([\s\S]*?)<\/\1>/gi;
// Same pattern without /g: RegExp.prototype.test keeps state on a global regex,
// which would make repeated calls return alternating results. Python's re.search
// has no such state.
const LIST_BLOCK_TEST = /<(OL|UL)\b[^>]*>[\s\S]*?<\/\1>/i;
const LIST_ITEM_RE = /<LI\b[^>]*>([\s\S]*?)<\/LI>/gi;
const BARE_BREAK_RE = /<BR\s*\/?>/gi;

/** Tags whose attributes may themselves contain ">" (title="a > b"). */
const TAG_RE = /<(\/?)([A-Za-z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
/** UL/OL at any depth; a list's extent is counted over these. */
const LIST_TAG_RE = /<(\/?)(OL|UL)\b[^>]*>/gi;
/** A line that starts a list item — indented or not. */
const LIST_LINE_RE = /^\s*(?:[-*]|\d+\.) /;
const URL_LIKE = /^(?:https?:\/\/|www\.)\S+$/;
const HEADING_RE = /^(#{1,6}) (.*)$/;
const STAR_RUN = /\*{4,}/g;

const BR_SENTINEL = "\u0000BR\u0000";
const MD_BREAK = "\u0000MBR\u0000";

const CODEISH = /["'}\]]|[\{\}\[\];:=]|"\s*:/;
const STRUCT_ONLY = /^[{}\[\]<>,;]+$/;

// --- entities -------------------------------------------------------------

// The corpus uses four named entities; the rest is here so a post with a
// different one does not end up as raw "&hellip;" in the output. Unknown names
// stay untouched, exactly like Python's html.unescape does.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0",
  ndash: "\u2013", mdash: "\u2014", hellip: "\u2026", middot: "\u00b7",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
  laquo: "\u00ab", raquo: "\u00bb", deg: "\u00b0", euro: "\u20ac",
  auml: "\u00e4", ouml: "\u00f6", uuml: "\u00fc", szlig: "\u00df",
  Auml: "\u00c4", Ouml: "\u00d6", Uuml: "\u00dc", eacute: "\u00e9",
  reg: "\u00ae", copy: "\u00a9", trade: "\u2122", times: "\u00d7",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X"
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

// --- helpers --------------------------------------------------------------

function hasText(fragment: string): boolean {
  const plain = decodeEntities(fragment.replace(/<[^>]+>/g, "")).replace(/\u00a0/g, " ");
  return plain.trim() !== "";
}

interface ListItem {
  html: string[];
  children: Array<{ ordered: boolean; items: ListItem[]; loose: string[] }>;
}

/**
 * The extent of the list starting at `start`: index of its closing tag and the
 * index behind it. null when the source never closes the list.
 *
 * Counting all UL/OL is the point: a non-greedy regex ends at the first </UL>
 * of a nested list and then treats everything up to it as list content, which
 * drops paragraphs that sit between items.
 */
function listBounds(text: string, start: number): { innerStart: number; innerEnd: number } | null {
  let depth = 0;
  const re = new RegExp(LIST_TAG_RE.source, "gi");
  re.lastIndex = start;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[1]) {
      depth -= 1;
      if (depth === 0) return { innerStart: match.index, innerEnd: match.index + match[0].length };
    } else {
      depth += 1;
    }
  }
  return null;
}

export class CommunityMarkdownConverter {
  private codeBlocks: string[] = [];
  private autolinks: string[] = [];

  /** Convert one post body. The caller frames the result (title, source, URL). */
  convert(source: string): string {
    let text = this.convertPre(source);

    const headingShift = /<H1\b/i.test(source) ? 1 : 0;

    text = text.replace(TABLE_RE, (whole, inner: string) => this.table(inner));
    text = text.replace(IMG_RE, (whole, src: string, caption: string | undefined) =>
      `\n![${this.inline(caption ?? "").trim()}](${src})\n`);
    text = text.replace(IMG_LOOSE_RE, (whole) => this.looseImage(whole));
    text = text.replace(HEAD_RE, (whole, level: string, title: string) => {
      // Levels move below the document title and keep their hierarchy: H3 -> ###,
      // H4 -> ####. Posts that use <H1> as a section heading shift one more
      // level, otherwise H1/H2/H3 all collapse onto the same level.
      let clean = this.inline(title).trim();
      clean = clean.replace(/\*{1,3}(.+?)\*{1,3}/g, "$1").trim();
      const shifted = Math.min(6, Math.max(2, Number.parseInt(level, 10) + headingShift));
      return `\n\n${"#".repeat(shifted)} ${clean}\n\n`;
    });

    text = this.convertLists(text);
    // Leftovers from unbalanced sources.
    text = text.replace(LIST_ITEM_RE, (whole, item: string) => `\n- ${this.inline(item).trim()}`);
    text = text.replace(/<\/?(?:UL|OL)\b[^>]*>/gi, "\n");

    text = text.replace(BARE_BREAK_RE, "\n");
    text = text.replace(/<\/?P\b[^>]*>/gi, "\n");

    text = this.inline(text);
    text = decodeEntities(text).replace(/\u00a0/g, " ");
    text = this.promoteIndentedCode(text);

    // Normalise before restoring the placeholders: code blocks and indented SQL
    // lines must not be touched by the whitespace rules. The indentation of
    // lists survives, otherwise nested items and continuation lines lose their
    // reference.
    text = text.replace(/(?<=\S)[ \t]+/g, " ");
    text = tidyLines(text);
    text = text.replace(/^#{1,6}\s*$/gm, ""); // empty headings
    // Posts nest <STRONG> inconsistently ("<STRONG><STRONG>x</STRONG></STRONG>").
    // Runs of four or more asterisks are ambiguous in Markdown; "***bold-italic***"
    // is left alone.
    text = text.replace(STAR_RUN, "**");
    text = text.replace(/^\s*[-*]\s*$/gm, ""); // empty bullets
    text = text.replace(/^\s*\d+\.\s*$/gm, ""); // empty numbering
    // Keep lists tight — also when the item is indented.
    text = text.replace(/\n{2,}(?=[ ]*(?:[-*]|\d+\.) )/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");

    return this.restore(text).trim() + "\n";
  }

  // --- placeholders -------------------------------------------------------

  private stash(kind: "code" | "autolink", value: string): string {
    const bucket = kind === "code" ? this.codeBlocks : this.autolinks;
    bucket.push(value);
    const marker = kind === "code" ? "CODE" : "AUTOLINK";
    return `\u0000${marker}${bucket.length - 1}\u0000`;
  }

  private restore(text: string): string {
    let out = text;
    this.codeBlocks.forEach((block, index) => {
      out = out.split(`\u0000CODE${index}\u0000`).join(block);
    });
    this.autolinks.forEach((url, index) => {
      out = out.split(`\u0000AUTOLINK${index}\u0000`).join(`<${url}>`);
    });
    // The Markdown line break comes last: an earlier <br> would be turned into a
    // newline by the case-insensitive <BR …> pattern and tear table rows apart.
    return out.split(MD_BREAK).join("<br>");
  }

  // --- building blocks ----------------------------------------------------

  private convertPre(source: string): string {
    return source.replace(PRE_RE, (whole, body: string) => {
      let inner = body
        .replace(/^\s*<CODE[^>]*>/i, "")
        .replace(/<\/CODE>\s*$/i, "");
      inner = decodeEntities(inner).replace(/\u00a0/g, " ");
      // <BR /> plus a following newline is exactly one break.
      inner = inner.replace(/<BR\s*\/?>[ \t]*\n?/gi, "\n");
      inner = inner.split("\n").map((line) => line.replace(/\s+$/, "")).join("\n").replace(/^\n+|\n+$/g, "");
      const language = /language-([\w+-]+)/i.exec(whole)?.[1] ?? "";
      return `\n${this.stash("code", "```" + language + "\n" + inner + "\n```")}\n`;
    });
  }

  private inline(fragment: string): string {
    let text = fragment;
    text = text.replace(/<STRONG\b[^>]*>/gi, "**").replace(/<\/STRONG>/gi, "**");
    text = text.replace(/<B\b[^>]*>/gi, "**").replace(/<\/B>/gi, "**");
    text = text.replace(/<EM\b[^>]*>/gi, "*").replace(/<\/EM>/gi, "*");
    text = text.replace(/<I\b[^>]*>/gi, "*").replace(/<\/I>/gi, "*");
    text = text.replace(/<CODE\b[^>]*>/gi, "`").replace(/<\/CODE>/gi, "`");

    text = text.replace(LINK_RE, (whole, href: string, label: string) => {
      const clean = label.trim();
      // Autolink via placeholder: the angle brackets would otherwise disappear
      // with the remaining tags.
      if (!clean || URL_LIKE.test(clean)) return this.stash("autolink", href);
      return `[${clean}](${href})`;
    });

    // Containers dissolve, their content stays.
    text = text.replace(/<\/?(?:SPAN|DIV|SECTION|BODY|HTML|TBODY|THEAD)\b[^>]*>/gi, "");
    // Remaining tags go, attributes (id="toc-hId-…") with them.
    return text.replace(/<[^>]+>/g, "");
  }

  private table(inner: string): string {
    const rows: string[][] = [];
    for (const rowMatch of inner.matchAll(ROW_RE)) {
      const cells: string[] = [];
      for (const cellMatch of rowMatch[1].matchAll(CELL_RE)) {
        cells.push(this.tableCell(cellMatch[2]));
      }
      if (cells.length) rows.push(cells);
    }
    if (!rows.length) return "\n";

    const width = Math.max(...rows.map((row) => row.length));
    const padded = rows.map((row) => [...row, ...Array(width - row.length).fill("")]);
    const lines = [`| ${padded[0].join(" | ")} |`, `|${Array(width).fill(" --- ").join("|")}|`];
    for (const row of padded.slice(1)) lines.push(`| ${row.join(" | ")} |`);
    return `\n${lines.join("\n")}\n`;
  }

  private tableCell(raw: string): string {
    // A Markdown table cell cannot hold a list. Without a separator two items
    // are glued into one word ("cost" + "No" -> "costNo"). <BR /> becomes a
    // sentinel, otherwise inline() removes it as a tag.
    const prepared = raw.replace(BARE_BREAK_RE, BR_SENTINEL);
    let joined: string;
    if (LIST_BLOCK_TEST.test(prepared)) {
      const items: string[] = [];
      for (const match of prepared.matchAll(LIST_ITEM_RE)) {
        if (match[1]) items.push(this.inline(match[1]).trim());
      }
      joined = items.filter((item) => item).join(MD_BREAK);
    } else {
      joined = this.inline(prepared).trim();
    }
    return joined.split(BR_SENTINEL).join(MD_BREAK).split("|").join("\\|");
  }

  private looseImage(tag: string): string {
    // An image without its own <P class="image_caption">: take the description
    // from the attributes, otherwise it is lost.
    const attributes: Record<string, string> = {};
    for (const match of tag.matchAll(ATTR_RE)) attributes[match[1].toLowerCase()] = match[2];
    const src = attributes.src ?? "";
    if (!src) return "";
    const alt = attributes.alt ?? attributes["image-alt"] ?? attributes.title ?? "";
    return `\n![${alt}](${src})\n`;
  }

  // --- lists --------------------------------------------------------------

  private convertLists(text: string): string {
    const out: string[] = [];
    let cursor = 0;
    let index = 0;
    while (index < text.length) {
      const re = new RegExp(LIST_TAG_RE.source, "gi");
      re.lastIndex = index;
      const match = re.exec(text);
      if (!match) break;
      if (match[1]) {                       // a lone </UL>/</OL>
        index = match.index + match[0].length;
        continue;
      }
      const bounds = listBounds(text, match.index);
      if (!bounds) {                        // unbalanced: leftovers later
        index = match.index + match[0].length;
        continue;
      }
      out.push(text.slice(cursor, match.index));
      out.push(this.renderList(text.slice(match.index + match[0].length, bounds.innerStart), match[2]));
      cursor = index = bounds.innerEnd;
    }
    out.push(text.slice(cursor));
    return out.join("");
  }

  private parseItems(fragment: string): { items: ListItem[]; loose: string[] } {
    const items: ListItem[] = [];
    const loose: string[] = [];
    let current: ListItem | null = null;

    const keep = (part: string): void => {
      if (current) current.html.push(part);
      else if (hasText(part)) loose.push(part);
    };

    let pos = 0;
    while (pos < fragment.length) {
      const re = new RegExp(TAG_RE.source, "g");
      re.lastIndex = pos;
      const match = re.exec(fragment);
      if (!match) {
        keep(fragment.slice(pos));
        break;
      }
      const textPart = fragment.slice(pos, match.index);
      const closing = match[1] === "/";
      const tag = match[2].toUpperCase();
      pos = match.index + match[0].length;

      if ((tag === "UL" || tag === "OL") && !closing) {
        const bounds = listBounds(fragment, match.index);
        if (!bounds) {
          keep(textPart);
          continue;
        }
        const children = this.parseItems(fragment.slice(match.index + match[0].length, bounds.innerStart));
        if (!current) {
          current = { html: [textPart], children: [] };
          items.push(current);
        } else {
          current.html.push(textPart);
        }
        current.children.push({ ordered: tag === "OL", ...children });
        pos = bounds.innerEnd;
        continue;
      }

      if (tag === "LI") {
        keep(textPart);
        if (closing) {
          current = null;
        } else {
          current = { html: [], children: [] };
          items.push(current);
        }
        continue;
      }

      if (tag === "BR") {
        keep(textPart);
        if (!closing) keep(match[0]);       // renderItems turns it into a continuation line
        continue;
      }

      // Every other tag stays in the item text: inline() turns <A>/<STRONG>/<CODE>
      // into Markdown and removes the rest.
      keep(textPart);
      keep(match[0]);
    }
    return { items, loose };
  }

  private renderList(fragment: string, kind: string): string {
    const { items, loose } = this.parseItems(fragment);
    const blocks: string[] = [];
    const rendered = this.renderItems(kind.toUpperCase() === "OL", items, 0);
    if (rendered) blocks.push(rendered);
    for (const part of loose) blocks.push(this.inline(part).trim());
    return `\n${blocks.filter((block) => block).join("\n")}\n`;
  }

  private renderItems(ordered: boolean, items: ListItem[], level: number): string {
    // Nested lists indent by two spaces per level; a continuation line of an item
    // lines up with the item's content column.
    const indent = "  ".repeat(level);
    const lines: string[] = [];
    items.forEach((item, position) => {
      const marker = ordered ? `${position + 1}. ` : "- ";
      const parts = item.html
        .join("")
        .split(BARE_BREAK_RE)
        .map((part) => this.inline(part).trim())
        .filter((part) => part);
      if (parts.length) {
        lines.push(`${indent}${marker}${parts[0]}`);
        const continuation = " ".repeat(indent.length + marker.length);
        for (const part of parts.slice(1)) lines.push(`${continuation}${part}`);
      }
      for (const child of item.children) {
        const rendered = this.renderItems(child.ordered, child.items, level + 1);
        if (rendered) lines.push(rendered);
        for (const part of child.loose) lines.push(this.inline(part).trim());
      }
    });
    return lines.join("\n");
  }

  // --- indented code ------------------------------------------------------

  private promoteIndentedCode(text: string): string {
    // Some posts write configuration blocks as paragraphs with leading spaces
    // instead of <PRE>. Without <PRE> that is not recognisable as code; the
    // indentation disappears during normalisation and the block reads as prose.
    // A run of at least three indented lines, most of them code-like, becomes a
    // block — including adjacent bracket-only lines the author left unindented.
    const lines = text.split("\n");
    const filled = lines.map((line, index) => (line.trim() ? index : -1)).filter((index) => index >= 0);

    const groups: number[][] = [];
    let current: number[] = [];
    let inList = false;
    filled.forEach((index, position) => {
      const line = lines[index];
      if (position && index > filled[position - 1] + 1) inList = false; // a blank line ends the list
      if (LIST_LINE_RE.test(line) || (inList && line.startsWith(" "))) {
        if (current.length >= 3) groups.push(current);
        current = [];
        inList = true;
        return;
      }
      inList = false;
      if (line.startsWith(" ")) {
        current.push(index);
      } else {
        if (current.length >= 3) groups.push(current);
        current = [];
      }
    });
    if (current.length >= 3) groups.push(current);

    const promoted = new Set<number>();
    for (const group of groups) {
      const content = group.map((index) => lines[index]);
      const codeish = content.filter((line) => CODEISH.test(line)).length;
      if (codeish < Math.max(2, Math.floor(content.length / 2))) continue;
      const slots = new Map(filled.map((index, slot) => [index, slot]));
      let first = group[0];
      let last = group[group.length - 1];
      while (slots.has(first) && (slots.get(first) as number) > 0 &&
             STRUCT_ONLY.test(lines[filled[(slots.get(first) as number) - 1]].trim())) {
        first = filled[(slots.get(first) as number) - 1];
      }
      while (slots.has(last) && (slots.get(last) as number) + 1 < filled.length &&
             STRUCT_ONLY.test(lines[filled[(slots.get(last) as number) + 1]].trim())) {
        last = filled[(slots.get(last) as number) + 1];
      }
      for (let index = first; index <= last; index++) promoted.add(index);
    }

    if (!promoted.size) return text;

    const out: string[] = [];
    let index = 0;
    while (index < lines.length) {
      if (promoted.has(index) && (index === 0 || !promoted.has(index - 1))) {
        let end = index;
        while (end < lines.length && promoted.has(end)) end++;
        const block = lines.slice(index, end).filter((line) => line.trim());
        const indents = block.map((line) => line.length - line.replace(/^ +/, "").length);
        const body = block.map((line) => line.slice(Math.min(...indents))).join("\n");
        out.push(this.stash("code", "```" + guessLanguage(body) + "\n" + body + "\n```"));
        index = end;
      } else {
        out.push(lines[index]);
        index++;
      }
    }
    return out.join("\n");
  }
}

// --- module-level helpers -------------------------------------------------

/** Straighten lines without losing the indentation of lists. */
export function tidyLines(text: string): string {
  const out: string[] = [];
  let inList = false;
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      out.push("");
      inList = false;
      continue;
    }
    if (LIST_LINE_RE.test(line)) {
      inList = true;
      out.push(line.replace(/\s+$/, ""));
    } else if (inList && line.startsWith(" ")) {
      out.push(line.replace(/\s+$/, "")); // continuation line of an item
    } else {
      inList = false;
      out.push(line.trim());
    }
  }
  return out.join("\n");
}

/** Guess the language of a code block that carries none. */
export function guessLanguage(body: string): string {
  if (/"\s*[A-Za-z_][\w.-]*"\s*:/.test(body)) return "json";
  if (/\b(SELECT|INSERT INTO|UPDATE|CREATE TABLE|DELETE FROM)\b/i.test(body)) return "sql";
  if (/<\/?[A-Za-z][\w:-]*[\s/>]/.test(body)) return "xml";
  return "";
}

/** Convert one SAP Community post body to Markdown. */
export function communityHtmlToMarkdown(html: string): string {
  if (!html) return "";
  return new CommunityMarkdownConverter().convert(html);
}
