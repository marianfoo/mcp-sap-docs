// The index creates fragment IDs by replacing runs of non-ASCII-alphanumeric
// characters in heading text with a dash. Use the same spelling for lookup.
export function headingFragment(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** Keep nested headings and fenced examples inside the requested section. */
export function markdownSection(source: string, fragment: string): string | undefined {
  const lines = source.split(/\r?\n/);
  const headings: Array<{ line: number; level: number; slug: string }> = [];
  let fence = '';
  for (const [i, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1].startsWith(fence) && !marker[2].trim()) fence = '';
      continue;
    }
    if (marker && (marker[1][0] === '~' || !marker[2].includes('`'))) {
      fence = marker[1];
      continue;
    }
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+)$/.exec(line);
    if (!heading) continue;
    headings.push({ line: i, level: heading[1].length, slug: headingFragment(heading[2].trim()) });
  }
  const matches = headings.filter(heading => heading.slug === fragment);
  if (matches.length !== 1) return undefined;
  const [match] = matches;
  const end = headings.find(heading => heading.line > match.line && heading.level <= match.level);
  return lines.slice(match.line, end?.line).join('\n').trimEnd();
}
