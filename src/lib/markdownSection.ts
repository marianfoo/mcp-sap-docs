// The index creates fragment IDs by replacing runs of non-ASCII-alphanumeric
// characters in heading text with a dash. Use the same spelling for lookup.
export function headingFragment(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** Keep nested headings and fenced examples inside the requested section. */
export function markdownSection(source: string, fragment: string): string | undefined {
  const lines = source.split(/\r?\n/);
  let start = -1;
  let level = 0;
  let fence = '';
  for (const [i, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1].startsWith(fence) && !marker[2].trim()) fence = '';
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+)$/.exec(line);
    if (!heading) continue;
    if (start >= 0 && heading[1].length <= level) return lines.slice(start, i).join('\n').trimEnd();
    if (start < 0 && headingFragment(heading[2].trim()) === fragment) {
      start = i;
      level = heading[1].length;
    }
  }
  if (start >= 0) return lines.slice(start).join('\n').trimEnd();
}
