/** SAP's generated vocabulary references put term definitions in table rows.
 * Index those rows individually so terms beyond the description cutoff can be found.
 * Fetch still returns the complete reference, including types and qualifications.
 */
export function extractVocabularyTerms(content: string, relFile: string) {
  const vocabulary = relFile.replace(/\.md$/, '');
  const terms = [];
  let inTerms = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^## /.test(line)) inTerms = line.trim() === '## Terms';
    if (!inTerms) continue;
    const match = line.match(/^\[([A-Za-z][\w]*)\]\([^)]*\).*?\|.*?\|(.+)$/);
    if (!match) continue;
    const name = match[1];
    terms.push({
      name,
      title: `${vocabulary}.${name} — OData annotation term`,
      // Keep Experimental notices from the first column as well as the definition.
      description: line.replace(/<a\s+name="[^"]*"><\/a>/g, '').slice(0, 1000),
      keywords: [name, `${vocabulary}.${name}`, 'OData', 'annotation', vocabulary],
    });
  }
  return terms;
}
