// Shared markdown → plain-text normalization for the retrieval pipeline.
//
// Both retrieval legs start from the same markdown, but want different things
// out of it, so this is ONE entry point with the divergence behind a flag:
//
//   • Dense / embedding leg  → clean, code-free PROSE. A transformer averages
//     every token into one vector, so markup punctuation and code snippets are
//     noise that drifts the vector. Call with { keepCode: false }.
//   • Lexical / BM25 leg     → keep the API/code identifiers (RAISE EXCEPTION,
//     cx_failed, …). Exact keyword match is BM25's strength, and SQLite's FTS5
//     tokenizer already discards punctuation for it. Call with { keepCode: true }.
//
// Everything else — breadcrumb nav, link/heading/emphasis markup, table pipes,
// whitespace — is noise for BOTH legs and is stripped identically. Keeping this
// in one place stops the build-index / build-embeddings / online-HTML paths from
// drifting into divergent ad-hoc regex.
export interface NormalizeOptions {
  /** Preserve code content (true = BM25 keyword density; false = clean prose for embeddings). */
  keepCode?: boolean;
  /** Truncate output to this many characters (0 = unbounded). */
  maxChars?: number;
}

export function normalizeMarkdown(input: string | undefined | null, opts: NormalizeOptions = {}): string {
  const { keepCode = false, maxChars = 0 } = opts;
  let t = input ?? "";

  // 1) Code. Lexical: unwrap fences but keep the inner tokens. Embedding: drop entirely.
  if (keepCode) {
    t = t.replace(/```[a-zA-Z0-9_-]*\n?/g, " ").replace(/```/g, " ").replace(/`/g, " ");
  } else {
    t = t.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  }

  // 2) Breadcrumb / nav lines are intentionally NOT filtered here. A blockquote
  //    carrying ≥2 anchor links (e.g. `> [Clean ABAP](#...) > [Error Handling](#...)`)
  //    is stripped of its link syntax by step 3 and its `>` marker by step 4, leaving
  //    plain hierarchy labels ("Clean ABAP Error Handling Return Codes") that improve
  //    embedding alignment for guideline sections. Callers that don't want breadcrumb
  //    text in the returned description should filter those lines before calling this
  //    function (see extractMarkdownSections in build-index.ts).

  // 3) Images out; links collapse to their anchor text.
  t = t
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // 4) Remaining structural markup → plain text.
  t = t
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // heading markers
    .replace(/^\s*>\s?/gm, "")          // blockquote markers
    .replace(/^\s*[-*+]\s+/gm, "")      // list bullets
    .replace(/\|/g, " ")                // table pipes
    .replace(/[*_~]+/g, "")             // emphasis / strikethrough
    .replace(/\s+/g, " ")               // collapse whitespace
    .trim();

  return maxChars > 0 ? t.slice(0, maxChars).trim() : t;
}
