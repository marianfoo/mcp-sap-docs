// Fixed evaluation query set (roadmap "item 0" — gates ranking-sensitive changes).
//
// Each entry is a query the grounding rules actually trigger, paired with the
// doc id(s)/url-fragment(s) that SHOULD rank highly. A query "hits" at rank N when
// the first ranked result whose id contains ANY `expected` fragment is at position N.
//
// `expected` fragments are matched case-insensitively as substrings against the
// libraryId/path that the server prints on each `⭐️ **<id>**` line. Keep fragments
// stable (loio / file slug / heading anchor), not full URLs, so minor formatting
// changes don't break ground truth.
//
// Curation: seeded from live probes against v0.3.45 (commit bd5d738). REFINE the
// `expected` lists from real ABAP/CDS/UI5 sessions — that's the human-in-the-loop
// part of the eval harness. Add queries; don't silently delete (it inflates scores).

export default [
  // ── ABAP language: regex / strings / built-in classes ──────────────────────
  {
    id: "abap-regex-pcre",
    category: "abap-regex",
    query: "FIND PCRE regex with unicode character property class",
    expected: ["ABENREGEX_PCRE_SYNTAX"],
    note: "grounding rule's canonical example (Cyrillic \\p{...} lives in _SPECIALS)",
  },
  {
    id: "abap-gzip",
    category: "abap-api",
    query: "compress binary data with CL_ABAP_GZIP",
    expected: ["ABENCL_ABAP_GZIP"],
  },
  {
    id: "abap-string-templates",
    category: "abap-strings",
    query: "string template formatting options in ABAP",
    expected: ["ABENSTRING_TEMPLATES_PREDEF_FORMAT", "ABENSTRING_TEMPLATES"],
  },
  {
    id: "abap-authority-check",
    category: "abap-security",
    query: "perform an authority check in ABAP",
    expected: ["ABAPAUTHORITY-CHECK", "ABENBC_AUTHORITY_CHECK"],
  },
  {
    id: "abap-for-all-entries",
    category: "abap-sql",
    query: "SELECT FOR ALL ENTRIES performance",
    expected: ["ABENWHERE_ALL_ENTRIES", "FOR_ALL_ENTRIES"],
  },
  {
    id: "abap-loop-group-by",
    category: "abap-itab",
    query: "loop at internal table group by",
    expected: ["ABAPLOOP_AT_GROUP", "LOOP_AT_ITAB_GROUP_BY"],
  },
  {
    id: "abap-secondary-key",
    category: "abap-itab",
    query: "secondary internal table key sorted hashed",
    expected: ["SECONDARY_KEY", "01_Internal_Tables"],
  },
  {
    id: "abap-unit-test",
    category: "abap-test",
    query: "ABAP unit test class for testing methods",
    expected: ["ABAPCLASS_FOR_TESTING", "ABAPMETHODS_TESTING"],
  },

  // ── CDS ─────────────────────────────────────────────────────────────────────
  {
    id: "cds-define-view",
    category: "cds",
    query: "define CDS view entity with select from",
    expected: ["ABENCDS_DEFINE_VIEW_ENTITY"],
  },
  {
    id: "cds-value-help-annotation",
    category: "cds-annotation",
    query: "value help annotation for a CDS field",
    expected: ["ABENCDS_F1_DEFINE_ANNOTATION_TYPE", "field-help", "valueHelp"],
    note: "weak under v0.3.45 — top hits are dynpro value help; tracks #7b/#3 impact",
  },

  // ── RAP ───────────────────────────────────────────────────────────────────
  {
    id: "rap-determination",
    category: "rap",
    query: "RAP determination on save in behavior definition",
    expected: ["ABENBDL_DETERMINATIONS"],
  },
  {
    id: "rap-eml-modify",
    category: "rap-eml",
    query: "modify entity with EML in RAP",
    expected: ["ABAPMODIFY_ENTITY_ENTITIES_OP", "08_EML"],
  },

  // ── UI5 / Fiori Elements ────────────────────────────────────────────────────
  {
    id: "ui5-two-way-binding",
    category: "ui5",
    query: "JSONModel two way data binding in UI5",
    expected: ["two-way-data-binding", "data-binding-68b9644", "odata-v2-model"],
  },
  {
    id: "ui5-growing-table",
    category: "ui5",
    query: "growing table scroll in sap.m.Table",
    expected: ["growing-feature-for-table-and-list", "GrowingList"],
  },
  {
    id: "ui5-fiori-elements-lineitem",
    category: "fiori-elements",
    query: "fiori elements list report line item annotation",
    expected: ["06_SAP_Fiori_Elements", "LineItem"],
    note: "broad target; current top hit is an ABAP example doc — ranking signal",
  },

  // ── wdi5 ──────────────────────────────────────────────────────────────────
  {
    id: "wdi5-locator",
    category: "wdi5",
    query: "wdi5 locator to click a button",
    expected: ["/wdi5/locators", "/wdi5/usage"],
  },

  // ── CAP ───────────────────────────────────────────────────────────────────
  {
    id: "cap-associations",
    category: "cap",
    query: "define entity associations in CAP",
    expected: ["/cap/guides/domain-modeling#associations", "/cap/cds/cdl"],
  },
  {
    id: "cap-expose-projection",
    category: "cap",
    query: "expose entities as a projection in a CAP service",
    expected: ["/cap/cds/cdl#exposed-entities", "/cap/guides/using-services"],
  },

  // ── BTP / Cloud SDK ─────────────────────────────────────────────────────────
  {
    id: "btp-destination",
    category: "btp",
    query: "BTP destination service for connectivity",
    expected: ["btp-destination-service", "destination"],
  },
];
