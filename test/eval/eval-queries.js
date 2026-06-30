// Fixed evaluation query set (roadmap "item 0" — gates ranking-sensitive changes).
//
// Each entry is a query the grounding rules actually trigger, paired with one or more
// gold doc id fragments. A query "hits" at rank N when the first ranked result whose
// id contains ANY `golds` fragment appears at position N (multi-gold: any matching
// fragment counts — the harness measures directional improvement, not absolute recall).
//
// `golds` fragments are matched case-insensitively as substrings against the
// libraryId/path that the server prints on each `⭐️ **<id>**` line. Keep fragments
// stable (loio / file slug / heading anchor), not full URLs, so minor formatting
// changes don't break ground truth.
//
// Curation: seeded from live probes against v0.3.45 (commit bd5d738). REFINE the
// `golds` lists from real ABAP/CDS/UI5 sessions — that's the human-in-the-loop
// part of the eval harness. Add queries; don't silently delete (it inflates scores).

export default [
  // ── ABAP language: regex / strings / built-in classes ──────────────────────
  {
    id: "abap-regex-pcre",
    category: "abap-regex",
    query: "FIND PCRE regex with unicode character property class",
    golds: ["ABENREGEX_PCRE_SYNTAX"],
    note: "grounding rule's canonical example (Cyrillic \\p{...} lives in _SPECIALS)",
  },
  {
    id: "abap-gzip",
    category: "abap-api",
    query: "compress binary data with CL_ABAP_GZIP",
    golds: ["ABENCL_ABAP_GZIP"],
  },
  {
    id: "abap-string-templates",
    category: "abap-strings",
    query: "string template formatting options in ABAP",
    golds: ["ABENSTRING_TEMPLATES_PREDEF_FORMAT", "ABENSTRING_TEMPLATES"],
  },
  {
    id: "abap-authority-check",
    category: "abap-security",
    query: "perform an authority check in ABAP",
    golds: ["ABAPAUTHORITY-CHECK", "ABENBC_AUTHORITY_CHECK"],
  },
  {
    id: "abap-for-all-entries",
    category: "abap-sql",
    query: "SELECT FOR ALL ENTRIES performance",
    golds: ["ABENWHERE_ALL_ENTRIES", "FOR_ALL_ENTRIES"],
  },
  {
    id: "abap-loop-group-by",
    category: "abap-itab",
    query: "loop at internal table group by",
    golds: ["ABAPLOOP_AT_GROUP", "LOOP_AT_ITAB_GROUP_BY"],
  },
  {
    id: "abap-secondary-key",
    category: "abap-itab",
    query: "secondary internal table key sorted hashed",
    golds: ["SECONDARY_KEY", "01_Internal_Tables"],
  },
  {
    id: "abap-unit-test",
    category: "abap-test",
    query: "ABAP unit test class for testing methods",
    golds: ["ABAPCLASS_FOR_TESTING", "ABAPMETHODS_TESTING"],
  },

  // ── CDS ─────────────────────────────────────────────────────────────────────
  {
    id: "cds-define-view",
    category: "cds",
    query: "define CDS view entity with select from",
    golds: ["ABENCDS_DEFINE_VIEW_ENTITY"],
  },
  {
    id: "cds-value-help-annotation",
    category: "cds-annotation",
    query: "value help annotation for a CDS field",
    golds: ["ABENCDS_F1_DEFINE_ANNOTATION_TYPE", "field-help", "valueHelp"],
    note: "weak under v0.3.45 — top hits are dynpro value help; tracks relevance-ranking signal",
  },

  // ── RAP ───────────────────────────────────────────────────────────────────
  {
    id: "rap-determination",
    category: "rap",
    query: "RAP determination on save in behavior definition",
    golds: ["ABENBDL_DETERMINATIONS"],
  },
  {
    id: "rap-eml-modify",
    category: "rap-eml",
    query: "modify entity with EML in RAP",
    golds: ["ABAPMODIFY_ENTITY_ENTITIES_OP", "08_EML"],
  },

  // ── UI5 / Fiori Elements ────────────────────────────────────────────────────
  {
    id: "ui5-two-way-binding",
    category: "ui5",
    query: "JSONModel two way data binding in UI5",
    golds: ["two-way-data-binding", "data-binding-68b9644", "odata-v2-model"],
  },
  {
    id: "ui5-growing-table",
    category: "ui5",
    query: "growing table scroll in sap.m.Table",
    golds: ["growing-feature-for-table-and-list", "GrowingList"],
  },
  {
    id: "ui5-fiori-elements-lineitem",
    category: "fiori-elements",
    query: "fiori elements list report line item annotation",
    golds: ["06_SAP_Fiori_Elements", "LineItem"],
    note: "broad target; current top hit is an ABAP example doc — ranking signal",
  },

  // ── wdi5 ──────────────────────────────────────────────────────────────────
  {
    id: "wdi5-locator",
    category: "wdi5",
    query: "wdi5 locator to click a button",
    golds: ["/wdi5/locators", "/wdi5/usage"],
  },

  // ── CAP ───────────────────────────────────────────────────────────────────
  {
    id: "cap-associations",
    category: "cap",
    query: "define entity associations in CAP",
    golds: ["/cap/guides/domain-modeling#associations", "/cap/cds/cdl"],
  },
  {
    id: "cap-expose-projection",
    category: "cap",
    query: "expose entities as a projection in a CAP service",
    golds: ["/cap/cds/cdl#exposed-entities", "/cap/guides/using-services"],
  },

  // ── BTP / Cloud SDK ─────────────────────────────────────────────────────────
  {
    id: "btp-destination",
    category: "btp",
    query: "BTP destination service for connectivity",
    golds: ["btp-destination-service", "destination"],
  },

  // ── lexical-gap (consultant phrasing) ──────────────────────────────────────────────
  // These re-use the SAME golds as their coder-phrased twins above (abap-gzip /
  // abap-authority-check / abap-for-all-entries) but phrase the query in user-language
  // with NO API/keyword overlap. A system relying on keyword matching alone will miss
  // these — they are the semantic recall floor the suite is designed to surface.
  {
    id: "abap-gzip-lexical",
    category: "lexical-gap",
    query: "reduce the size of a byte string in memory before storing it",
    golds: ["ABENCL_ABAP_GZIP", "SCMS_XSTRING_COMPRESS"],
    note: "gold ABENCL_ABAP_GZIP; SCMS_XSTRING_COMPRESS accepted as alternative",
  },
  {
    id: "abap-authority-check-lexical",
    category: "lexical-gap",
    query: "check whether the logged-in user is allowed to perform this action",
    golds: ["ABAPAUTHORITY-CHECK", "ABENBC_AUTHORITY_CHECK"],
    note: "statement/guideline doc; glossary and cheat-sheet tend to rank ahead on keyword-only systems",
  },
  {
    id: "abap-for-all-entries-lexical",
    category: "lexical-gap",
    query: "read database rows for every key stored in an internal table",
    golds: ["ABENWHERE_ALL_ENTRIES", "FOR_ALL_ENTRIES"],
    note: "obsolete variants tend to outrank the modern FOR ALL ENTRIES doc on keyword-only systems",
  },

  // ── architect / best-practice ─────────────────────────────────────────────────
  // Design/"recommended way" questions whose gold is a best-practice guideline that
  // EXISTS offline (Clean ABAP under /sap-styleguides, DSAG Leitfaden). Phrased with
  // little/no keyword overlap with the guideline title to stress semantic recall — the
  // same offline lever as the lexical-gap set. NOT functional-consultant queries: the
  // offline corpus has no FI/CO/customizing content, so those have no offline gold and
  // belong to the online/community eval (run-scope-eval.js), not this offline gate.
  {
    id: "best-exceptions-vs-returncodes",
    category: "best-practice",
    query: "what is the recommended way to signal a failure from an ABAP method",
    golds: ["prefer-exceptions-to-return-codes"],
    note: "Clean ABAP guideline",
  },
  {
    id: "best-composition-vs-inheritance",
    category: "best-practice",
    query: "is it better to extend a class or wrap it when reusing behavior in ABAP",
    golds: ["prefer-composition-to-inheritance"],
    note: "Clean ABAP guideline",
  },
  {
    id: "best-new-vs-create-object",
    category: "best-practice",
    query: "recommended way to instantiate a class in modern ABAP",
    golds: ["prefer-new-to-create-object"],
    note: "Clean ABAP guideline",
  },
  {
    id: "best-package-architecture",
    category: "best-practice",
    query: "how should I organize packages for a maintainable SAP application",
    golds: ["architecture_and_structure", "package-strategy"],
    note: "DSAG ABAP Leitfaden — source diversity (not Clean ABAP)",
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Recall-stress cohort (added 2026-06-26). Three sub-groups, each probing a
  // distinct recall lever:
  //
  //   A) COVERAGE-TEST — gold is a `markdown-section` chunk. A system that only
  //      embeds whole documents cannot satisfy these; they act as canaries for
  //      section-level indexing coverage. Anchored fragments (`...#slug` /
  //      `cdl#...`) ensure the parent document cannot accidentally satisfy them.
  //      Expect to miss on any system without section-level embeddings.
  //   B) PARAPHRASE — gold is an embedded `markdown` doc, queried in natural
  //      language with no API/keyword overlap. Measures semantic recall without
  //      relying on keyword co-occurrence.
  //   C) A couple of coder-phrased queries for stable statistical mass.
  // ════════════════════════════════════════════════════════════════════════════

  // ── A) coverage-test: Clean ABAP guidelines (gold = markdown-section) ──────────
  {
    id: "cov-read-table-vs-loop",
    category: "coverage-test",
    query: "fastest way to find one record in an internal table without looping over it",
    golds: ["prefer-read-table-to-loop-at"],
    note: "coverage-test: gold is a markdown-section chunk; misses on systems without section-level embeddings",
  },
  {
    id: "cov-line-exists",
    category: "coverage-test",
    query: "how to check whether a row exists in a table without reading it into a variable",
    golds: ["prefer-line-exists-to-read-table-or-loop-at"],
    note: "coverage-test: gold is a markdown-section chunk; misses on systems without section-level embeddings",
  },
  {
    id: "cov-insert-vs-append",
    category: "coverage-test",
    query: "recommended statement to add rows to a sorted or hashed internal table",
    golds: ["prefer-insert-into-table-to-append-to"],
    note: "coverage-test: gold is a markdown-section chunk; misses on systems without section-level embeddings",
  },
  {
    id: "cov-avoid-default-key",
    category: "coverage-test",
    query: "why you should not rely on the standard table key when looking up rows",
    golds: ["avoid-default-key"],
    note: "coverage-test: gold is a markdown-section chunk; misses on systems without section-level embeddings",
  },
  {
    id: "cov-inline-declarations",
    category: "coverage-test",
    query: "should I declare variables up front or inline where they are first used",
    golds: ["prefer-inline-to-up-front-declarations"],
    note: "coverage-test: gold is a markdown-section chunk; misses on systems without section-level embeddings",
  },
  {
    id: "cov-oo-vs-procedural",
    category: "coverage-test",
    query: "is it better to write new business logic in classes or in reports and function modules",
    golds: ["prefer-object-orientation-to-procedural-programming"],
    note: "coverage-test: gold is a markdown-section chunk; misses on systems without section-level embeddings",
  },
  {
    id: "cov-loop-where-vs-if",
    category: "coverage-test",
    query: "cleaner way to skip rows in a loop instead of wrapping the body in an if",
    golds: ["prefer-loop-at-where-to-nested-if"],
    note: "coverage-test: gold is a markdown-section chunk; misses on systems without section-level embeddings",
  },

  // ── A) coverage-test: CAP CDS concepts (gold = markdown-section) ───────────────
  {
    id: "cov-cap-event-handlers",
    category: "coverage-test",
    query: "where do I put custom logic that runs when a CAP service request comes in",
    golds: ["providing-services#event-handlers"],
    note: "coverage-test: gold is a markdown-section chunk; misses on systems without section-level embeddings",
  },
  {
    id: "cov-cap-view-parameters",
    category: "coverage-test",
    query: "how to define a CAP view that accepts input parameters",
    golds: ["cdl#views-with-parameters"],
    note: "coverage-test: gold is a markdown-section chunk; misses on systems without section-level embeddings",
  },

  // ── B) paraphrase: embedded markdown docs, consultant phrasing ─────────────────
  {
    id: "para-read-table",
    category: "lexical-gap",
    query: "get a single entry out of an internal table using its key value",
    golds: ["ABAPREAD_TABLE"],
    note: "B — markdown gold (embedded); paraphrase recall",
  },
  {
    id: "para-sort-itab",
    category: "lexical-gap",
    query: "arrange the rows of an internal table into a particular order",
    golds: ["ABAPSORT_ITAB"],
    note: "B — markdown gold (embedded); paraphrase recall",
  },
  {
    id: "para-collect",
    category: "lexical-gap",
    query: "accumulate numeric totals into a table summed up per key",
    golds: ["ABAPCOLLECT"],
    note: "B — markdown gold (embedded); paraphrase recall",
  },
  {
    id: "para-delete-duplicates",
    category: "lexical-gap",
    query: "remove repeated adjacent rows from an internal table",
    golds: ["ABAPDELETE_DUPLICATES"],
    note: "B — markdown gold (embedded); paraphrase recall",
  },
  {
    id: "para-try-catch",
    category: "lexical-gap",
    query: "handle a runtime error gracefully so the program does not dump",
    golds: ["ABAPTRY"],
    note: "B — markdown gold (embedded); paraphrase recall",
  },
  {
    id: "para-rtti",
    category: "lexical-gap",
    query: "inspect the type of a data object while the program is running",
    golds: ["ABENRTTI"],
    note: "B — markdown gold (embedded); paraphrase recall",
  },
  {
    id: "para-asjson",
    category: "lexical-gap",
    query: "turn an ABAP structure into a JSON string",
    golds: ["ABENABAP_ASJSON"],
    note: "B — markdown gold (embedded); paraphrase recall",
  },

  // ── C) coder-phrased mass (gold = markdown, likely already hit) ────────────────
  {
    id: "abap-raise-exception-class",
    category: "abap-exceptions",
    query: "RAISE EXCEPTION TYPE class based exception",
    golds: ["ABAPRAISE_EXCEPTION_CLASS", "ABAPRAISE_EXCEPTION"],
    note: "C — coder phrasing, statistical mass",
  },
  {
    id: "abap-convert-date",
    category: "abap-datetime",
    query: "CONVERT DATE time stamp into time zone",
    golds: ["ABAPCONVERT_DATE"],
    note: "C — coder phrasing, statistical mass",
  },
];
