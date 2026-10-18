/** First prose line for Markdown pages without an authored description. */
export function markdownDescription(content: string): string {
  let fence: string | undefined;
  const visible = content
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
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
    const text = line.replace(/<\/?[a-z][^>]*>/gi, '').trim();
    // Skip headings, image-only lines, tables, link definitions and separators.
    if (!text || /^(?:#|!\[|\||\[[^\]]+\]:|\[\[toc\]\]|[-*_]{3,}\s*$|=+\s*$)/i.test(text)) continue;
    if (/^\*\*(?:Related Information|On this page:)\*\*$/i.test(text)) continue;
    if (/^[-*+]\s+\[[^\]]+\]\([^)]*\)\s*$/.test(text)) continue;
    return text.slice(0, 400).trim();
  }
  return '';
}
