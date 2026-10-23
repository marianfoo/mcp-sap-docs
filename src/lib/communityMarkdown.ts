// Community bodies are HTML; the caller adds the Markdown title and citation.
// Use a separate Turndown instance so these rules cannot affect SAP Help.
import TurndownService from "turndown";
import { strikethrough, taskListItems } from "turndown-plugin-gfm";
import { createDocument } from "@mixmark-io/domino";

function httpDestination(value: string): string {
  const target = value.trim();
  try {
    const url = new URL(target);
    return url.protocol === "https:" || url.protocol === "http:" ? target : "";
  } catch {
    return "";
  }
}

function communityBody(html: string): HTMLElement {
  // Use Turndown's own DOM implementation. Work on HTML, never on generated
  // Markdown, where literal code and intentionally separate runs look alike.
  const document = createDocument(`<x-community-body>${html}</x-community-body>`);
  const root = document.querySelector("x-community-body") as HTMLElement;
  const inCode = (node: Element) => !!node.closest("pre,code");
  for (const anchor of Array.from(root.querySelectorAll("a[href]"))) {
    if (!inCode(anchor)) anchor.setAttribute("href", anchor.getAttribute("href")!.trim());
  }
  for (const iframe of Array.from(root.querySelectorAll("iframe"))) {
    if (inCode(iframe)) continue;
    let target = httpDestination(iframe.getAttribute("src") ?? "");
    if (target) {
      const wrapper = new URL(target);
      if (wrapper.hostname === "cdn.embedly.com" && wrapper.pathname === "/widgets/media.html") {
        target = httpDestination(wrapper.searchParams.get("url") ?? "") || target;
      }
    }
    if (!target) {
      iframe.parentNode!.removeChild(iframe);
      continue;
    }
    // Empty iframes (and otherwise empty wrappers) hit Turndown's blank rule
    // before custom rules. A real anchor survives that rule and reuses its
    // existing label, URL and table-cell escaping.
    const link = document.createElement("a");
    link.setAttribute("href", target);
    link.textContent = iframe.getAttribute("title")?.replace(/\s+/g, " ").trim() || "Embedded content";
    iframe.parentNode!.replaceChild(link, iframe);
  }
  const emphasis = (node: Node) => /^(I|EM)$/.test(node.nodeName) ? "em"
    : /^(B|STRONG)$/.test(node.nodeName) ? "strong" : "";
  for (const node of Array.from(root.querySelectorAll("i,em,b,strong"))) {
    if (!node.parentNode || inCode(node)) continue;
    while (node.nextSibling) {
      let next: ChildNode | null = node.nextSibling;
      const gap: Node[] = [];
      while (next?.nodeType === 3 && /^[\s\u00a0]*$/.test(next.nodeValue ?? "")) {
        gap.push(next);
        next = next.nextSibling;
      }
      if (!next || emphasis(next) !== emphasis(node)) break;
      for (const space of gap) node.appendChild(space);
      while (next.firstChild) node.appendChild(next.firstChild);
      next.parentNode!.removeChild(next);
    }
  }
  return root;
}

function fencedCode(text: string, language = ""): string {
  const body = text.replace(/\r\n?/g, "\n").replace(/^\n|\n$/g, "");
  const runs = body.match(/`+/g) ?? [];
  const fence = "`".repeat(runs.reduce((length, run) => Math.max(length, run.length + 1), 3));
  return `\n\n${fence}${language}\n${body}\n${fence}\n\n`;
}

function inlineCode(text: string): string {
  const body = text.replace(/\r\n?|\n/g, " ");
  const fence = "`".repeat((body.match(/`+/g) ?? []).reduce((length, run) => Math.max(length, run.length + 1), 1));
  const padding = body.startsWith("`") || body.endsWith("`")
    || (body.startsWith(" ") && body.endsWith(" ") && /\S/.test(body)) ? " " : "";
  return `${fence}${padding}${body}${padding}${fence}`;
}

function codeText(node: HTMLElement): string {
  const copy = node.cloneNode(true) as HTMLElement;
  for (const br of Array.from(copy.querySelectorAll("br"))) {
    const followedByNewline = br.nextSibling?.nodeType === 3 && br.nextSibling.nodeValue?.startsWith("\n");
    br.replaceWith(copy.ownerDocument.createTextNode(followedByNewline ? "" : "\n"));
  }
  return copy.textContent ?? "";
}

/** Convert a Community HTML body, without changing the caller's Markdown frame. */
export function communityHtmlToMarkdown(html: string): string {
  if (!html) return "";
  const service = new TurndownService({
    headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced",
    preformattedCode: true, emDelimiter: "*", hr: "---",
  });
  service.use([strikethrough, taskListItems]);
  service.remove(["script", "style", "noscript"]);
  // Keep literal HTML/entity examples from being interpreted again by Markdown.
  const escape = service.escape.bind(service);
  service.escape = text => escape(text).replace(/&(?=#?\w+;)/g, "\\&").replace(/</g, "\\<");
  service.addRule("nestedEmphasis", {
    filter: node => (/^(STRONG|B)$/.test(node.nodeName) && !!node.parentElement?.closest("strong,b"))
      || (/^(EM|I)$/.test(node.nodeName) && !!node.parentElement?.closest("em,i")),
    replacement: content => content,
  });

  service.addRule("communityHeadings", {
    filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
    replacement: (content, node) => {
      const shift = node.ownerDocument?.querySelector("h1") ? 1 : 0;
      const level = Math.min(6, Math.max(2, Number(node.nodeName[1]) + shift));
      return content.trim() ? `\n\n${"#".repeat(level)} ${content.trim()}\n\n` : "";
    },
  });

  service.addRule("communityCode", {
    filter: "pre",
    replacement: (_content, node) => {
      const text = codeText(node);
      // GFM table cells cannot contain fenced blocks. Preserve each line as
      // inline code; the cell rule handles line breaks and pipe escaping.
      if (node.closest("td,th")) {
        const lines = text.replace(/\r\n?/g, "\n").replace(/^\n|\n$/g, "").split("\n")
          .map(line => line ? inlineCode(line) : "").join("\n");
        return `\n\n${lines}\n\n`;
      }
      const classes = `${node.getAttribute("class") ?? ""} ${node.querySelector("code")?.getAttribute("class") ?? ""}`;
      const language = /\blanguage-([\w+-]+)/i.exec(classes)?.[1] ?? "";
      return fencedCode(text, language);
    },
  });
  service.addRule("communityInlineCode", {
    filter: "code",
    // The editor may auto-link an @annotation inside code. Child Markdown would
    // turn that identifier into a literal [label](url), so read its text instead.
    replacement: (_content, node) => inlineCode(codeText(node)),
  });

  // Keep text following a nested list outside its last item. The default rule
  // uses lastElementChild, which also matches lists followed by a text node.
  service.addRule("communityLists", {
    filter: ["ul", "ol"],
    replacement: (content, node) => node.parentNode?.nodeName === "LI"
      ? `\n${content.trimEnd()}\n\n` : `\n\n${content}\n\n`,
  });

  const captions = new WeakSet<Node>();
  service.addRule("communityImages", {
    filter: "img",
    replacement: (_content, node) => {
      const src = node.getAttribute("src");
      if (!src) return "";
      let container: HTMLElement = node;
      while (container.parentElement && /^(P|SPAN|A)$/.test(container.parentElement.nodeName)
        && container.parentElement.querySelectorAll("img").length === 1
        && !container.parentElement.textContent?.trim()) {
        container = container.parentElement;
      }
      const next = container.nextElementSibling;
      // Rich captions must remain normal Markdown so their links/images survive.
      const caption = next?.classList.contains("image_caption") && !next.querySelector("a,img") ? next : null;
      if (caption) captions.add(caption);
      const alt = caption?.textContent?.trim() || node.getAttribute("alt")
        || node.getAttribute("image-alt") || node.getAttribute("title") || "";
      const label = service.escape(alt.replace(/\s+/g, " "));
      const destination = src.replace(/[\\\s<>]/g, char => encodeURIComponent(char)).replace(/[()]/g, "\\$&");
      return `![${label}](${destination})`;
    },
  });
  service.addRule("usedImageCaptions", {
    filter: node => captions.has(node), replacement: () => "",
  });

  // Turndown visits children first. Reuse that converted content instead of
  // parsing cells again, which multiplies work and content for nested tables.
  const tableContent = new WeakMap<Node, string>();
  service.addRule("communityTableContent", {
    filter: ["td", "th", "caption"],
    replacement: (content, node) => {
      tableContent.set(node, content.trim());
      return content;
    },
  });

  // GFM needs a header: use the first row and pad short rows to the table width.
  service.addRule("communityTables", {
    filter: "table",
    replacement: (_content, node) => {
      const table = node as HTMLTableElement;
      // Domino includes nested rows in table.rows; only use this table's rows.
      const rows = Array.from(table.rows).filter(row => row.closest("table") === table)
        .map(row => Array.from(row.cells).filter(cell => cell.parentElement === row).map(cell => (tableContent.get(cell) ?? "")
          .replace(/ *\n+/g, "<br>").replace(/\|/g, "\\|")));
      if (!rows.length) return "";
      const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
      const lines = rows.map(row => `| ${[...row, ...Array(width - row.length).fill("")].join(" | ")} |`);
      lines.splice(1, 0, `| ${Array(width).fill("---").join(" | ")} |`);
      const captionNode = Array.from(table.children).find(child => child.nodeName === "CAPTION");
      const caption = captionNode ? (tableContent.get(captionNode) ?? "") + "\n\n" : "";
      return `\n\n${caption}${lines.join("\n")}\n\n`;
    },
  });

  return service.turndown(communityBody(html)).trim();
}
