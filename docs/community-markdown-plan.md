# Community post bodies as Markdown

## Why

Community fetches currently wrap LiQL HTML in a Markdown title and citation.
Converting the body once on the server gives all clients readable paragraphs,
links, lists, images, tables and code without a separate client-side converter.

## Implementation

- Convert the body, or fallback snippet, before adding the existing frame and
  applying the existing character limit. Keep citation and truncation metadata.
- Use an isolated instance of the existing Turndown dependency. SAP Help rules
  remain separate; no dependency or tool API is added.
- Add small rules for Community headings, image captions, literal code and
  tables. Use the HTML parser for attributes, entities and list structure.
- Preserve code languages when declared, and choose fences that cannot be
  closed by backticks inside a sample. Do not guess a language for plain text.
- Reuse the converted child content in table cells; do not parse it again.
  Include only each table's own rows and cells to prevent nested duplication.
- Keep linked or illustrated captions as normal Markdown. Honor HTML code
  markup instead of guessing code from the indentation or punctuation of prose.
- If conversion throws, retain that post's original HTML with a notice and
  continue the batch. Apply the same framing and character limit to the fallback.

The initial regex implementation lost table text and images, reordered nested
list content, damaged code, and threw on an invalid numeric entity. Matching a
client script byte-for-byte did not detect these errors. A separate Turndown
instance supports the needed rules without a service factory or shared profiles.

## Verification

- Regressions cover the reproduced failures, literal placeholders and code,
  malformed HTML, caption fallback, table cells, mixed nested lists, and batches.
- Nested-table tests require each value once and bounded output for deep input.
- Fetch tests verify conversion before framing/truncation, fallback snippets,
  structured output, resource reads and source citations.
- An independent sample of 85 public posts includes 27 posts with code blocks
  and 21 with tables. Rendered Markdown is compared with parsed source HTML for
  visible words, links, images and code. Downloaded content stays outside Git.
- Run the existing unit/integration suites, live fetches and simultaneous MCP
  requests. Require Claude Opus 5.5 Max review and CI before merging.

This changes Community fetch bodies from HTML to Markdown. IDs, source URLs,
response schemas and configured limits remain the same. Clients that parsed
the old raw HTML must consume Markdown instead.
