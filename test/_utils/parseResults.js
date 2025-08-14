// Parse the formatted summary from http-server /mcp response
// Extracts top items and their numeric scores.
export function parseSummaryText(text) {
  const items = [];
  const lineRe = /^⭐️ \*\*(.+?)\*\* \(Score: ([\d.]+)\)/;
  const lines = String(text || '').split('\n');

  for (const line of lines) {
    const m = line.match(lineRe);
    if (m) {
      items.push({
        id: m[1],
        finalScore: parseFloat(m[2]),
        rerankerScore: 0, // Always 0 in BM25-only mode
      });
    }
  }

  const matchCandidates = text.match(/Found (\d+) results/);
  const totalCandidates = matchCandidates ? parseInt(matchCandidates[1], 10) : null;

  return { items, totalCandidates };
}
