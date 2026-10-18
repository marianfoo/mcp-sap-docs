/** First prose line for Markdown pages without an authored description. */
export function markdownDescription(content: string): string {
  let fence: string | undefined;
  const visible = content
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/^[ \t]*<(script|style|pre)\b[^>]*>[\s\S]*?<\/\1\s*>/gim, '');
  for (const rawLine of visible.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*>\s?/, '');
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = undefined;
      }
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    // Preserve code spans, autolinks and placeholders such as <subdomain>.
    // Only known HTML formatting tags are removed from prose.
    const text = line.replace(/(`+).*?\1|<\/?(?:a|b|br|code|div|em|i|img|li|link|meta|ol|p|pre|span|strong|sub|sup|table|tbody|td|th|thead|tr|u|ul)\b[^>]*>/gi,
      token => token.startsWith('`') ? token : /^<\/?(?:br|div|li|p|td|th|tr)\b/i.test(token) ? ' ' : '')
      .replace(/(`+).*?\1|\s+/g, token => token.startsWith('`') ? token : ' ').trim();
    // Skip headings, image-only lines, tables, link definitions and separators.
    if (!text || /^(?:#|!\[|\||\[[^\]]+\]:|\[\[toc\]\]|[-*_]{3,}\s*$|=+\s*$)/i.test(text)) continue;
    if (/^(?:\[!\[|:::|\{\{)/.test(text)) continue;
    if (/^\*\*(?:Related Information|On this page:)\*\*$/i.test(text)) continue;
    if (/^[-*+]\s+\[[^\]]+\]\([^)]*\)\s*$/.test(text)) continue;
    return text.slice(0, 400).trim();
  }
  return '';
}
