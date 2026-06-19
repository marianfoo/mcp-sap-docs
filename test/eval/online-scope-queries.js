// Online-leg product-scope eval set (gates the SAP Help product-scoping fix).
//
// Two families of CONCEPTUAL / user-language questions where the UNSCOPED online SAP Help leg returned
// cross-product noise that outranked the correct docs in the merged list (see candidate-probes.md):
//   • ABAP-language ("consultant persona") — routed via `flavor` (the abapFlavor auto-mapping).
//   • FUNCTIONAL / configuration — routed via an explicit `product` (which `abapFlavor` cannot express).
//
// Each entry declares how a caller would scope it and a `coreToken` (normalised, uppercase-alphanumeric)
// used to classify whether a returned hit's product is on-target. run-scope-eval.js runs every query
// twice — UNSCOPED (abapFlavor:'auto' = pre-fix) vs SCOPED (the declared scope = post-fix).

export default [
  // ── ABAP-language (scope via abapFlavor) ──────────────────────────────────
  { id: "scope-gzip", flavor: "standard", coreToken: "ABAPPLATFORM",
    query: "reduce the size of a byte string in memory before storing it",
    note: "C1 — concept: CL_ABAP_GZIP / compression" },
  { id: "scope-authority-check", flavor: "standard", coreToken: "ABAPPLATFORM",
    query: "check whether the logged-in user is allowed to perform this action",
    note: "C2 — concept: AUTHORITY-CHECK" },
  { id: "scope-for-all-entries", flavor: "standard", coreToken: "ABAPPLATFORM",
    query: "read database rows for every key stored in an internal table",
    note: "C3 — concept: SELECT ... FOR ALL ENTRIES" },
  { id: "scope-dynamic-where", flavor: "standard", coreToken: "ABAPPLATFORM",
    query: "build a database query condition at runtime in ABAP",
    note: "concept: dynamic WHERE / dynamic SQL" },
  { id: "scope-enqueue-lock", flavor: "standard", coreToken: "ABAPPLATFORM",
    query: "stop two users from editing the same business object at the same time",
    note: "concept: enqueue / lock objects" },

  // ── FUNCTIONAL / configuration (scope via explicit product) ────────────────
  { id: "scope-fixed-asset-grant", product: "SAP_S4HANA_ON-PREMISE", coreToken: "S4HANA",
    query: "grant valuation areas active in OAYZ for the asset class are not showing in the Fixed Asset Valuation tab",
    note: "real chat-session functional Q (Asset Accounting / Grants) — abapFlavor cannot route this" },
  { id: "scope-billing-number-range", product: "SAP_S4HANA_ON-PREMISE", coreToken: "S4HANA",
    query: "where do I configure the number range for billing documents",
    note: "functional config — SD billing customizing" },
];
