// Collect vanilla MCP results for the pairwise eval.
//
// Append-only: skips queries already in pairwise-vanilla.json.
// Run in a Claude session where the upstream SAP docs MCP server is connected.
// Invoke: Workflow({ scriptPath: 'test/eval/collect-vanilla-workflow.js' })
// Args:   { vanillaTool?: string }  ToolSearch query for the upstream server's search tool.
//         Default: 'mcp-sap-docs search'. Use 'select:mcp__my-server__search' for an exact
//         lookup, or a keyword fragment like 'my-server search' for fuzzy matching.
//
// Agent count: 1 load-existing + ceil(missing/5) collect-batches + 1 save ≈ 3–11 total

export const meta = {
  name: 'collect-vanilla',
  description: 'Collect vanilla MCP results (append-only, 5 queries per agent)',
  phases: [
    { title: 'Collect-Vanilla', detail: 'Batched vanilla MCP calls for missing queries only' },
  ],
}

const QUERIES = [
  // ── ABAP language ──────────────────────────────────────────────────────────
  { id: 'abap-regex-pcre',          query: 'FIND PCRE regex with unicode character property class' },
  { id: 'abap-gzip',                query: 'compress binary data with CL_ABAP_GZIP' },
  { id: 'abap-string-templates',    query: 'string template formatting options in ABAP' },
  { id: 'abap-authority-check',     query: 'perform an authority check in ABAP' },
  { id: 'abap-for-all-entries',     query: 'SELECT FOR ALL ENTRIES performance' },
  { id: 'abap-loop-group-by',       query: 'loop at internal table group by' },
  { id: 'abap-secondary-key',       query: 'secondary internal table key sorted hashed' },
  { id: 'abap-unit-test',           query: 'ABAP unit test class for testing methods' },
  // ── CDS ────────────────────────────────────────────────────────────────────
  { id: 'cds-define-view',          query: 'define CDS view entity with select from' },
  { id: 'cds-value-help-annotation',query: 'value help annotation for a CDS field' },
  // ── RAP ────────────────────────────────────────────────────────────────────
  { id: 'rap-determination',        query: 'RAP determination on save in behavior definition' },
  { id: 'rap-eml-modify',           query: 'modify entity with EML in RAP' },
  // ── UI5 / Fiori Elements ───────────────────────────────────────────────────
  { id: 'ui5-two-way-binding',      query: 'JSONModel two way data binding in UI5' },
  { id: 'ui5-growing-table',        query: 'growing table scroll in sap.m.Table' },
  { id: 'ui5-fiori-elements-lineitem', query: 'fiori elements list report line item annotation' },
  // ── wdi5 ───────────────────────────────────────────────────────────────────
  { id: 'wdi5-locator',             query: 'wdi5 locator to click a button' },
  // ── CAP ────────────────────────────────────────────────────────────────────
  { id: 'cap-associations',         query: 'define entity associations in CAP' },
  { id: 'cap-expose-projection',    query: 'expose entities as a projection in a CAP service' },
  // ── BTP ────────────────────────────────────────────────────────────────────
  { id: 'btp-destination',          query: 'BTP destination service for connectivity' },
  // ── lexical-gap ───────────────────────────────────────────────────────────
  { id: 'abap-gzip-lexical',              query: 'reduce the size of a byte string in memory before storing it' },
  { id: 'abap-authority-check-lexical',   query: 'check whether the logged-in user is allowed to perform this action' },
  { id: 'abap-for-all-entries-lexical',   query: 'read database rows for every key stored in an internal table' },
  // ── best-practice ─────────────────────────────────────────────────────────
  { id: 'best-exceptions-vs-returncodes', query: 'what is the recommended way to signal a failure from an ABAP method' },
  { id: 'best-composition-vs-inheritance',query: 'is it better to extend a class or wrap it when reusing behavior in ABAP' },
  { id: 'best-new-vs-create-object',      query: 'recommended way to instantiate a class in modern ABAP' },
  { id: 'best-package-architecture',      query: 'how should I organize packages for a maintainable SAP application' },
  // ── coverage-test ─────────────────────────────────────────────────────────
  { id: 'cov-read-table-vs-loop',   query: 'fastest way to find one record in an internal table without looping over it' },
  { id: 'cov-line-exists',          query: 'how to check whether a row exists in a table without reading it into a variable' },
  { id: 'cov-insert-vs-append',     query: 'recommended statement to add rows to a sorted or hashed internal table' },
  { id: 'cov-avoid-default-key',    query: 'why you should not rely on the standard table key when looking up rows' },
  { id: 'cov-inline-declarations',  query: 'should I declare variables up front or inline where they are first used' },
  { id: 'cov-oo-vs-procedural',     query: 'is it better to write new business logic in classes or in reports and function modules' },
  { id: 'cov-loop-where-vs-if',     query: 'cleaner way to skip rows in a loop instead of wrapping the body in an if' },
  { id: 'cov-cap-event-handlers',   query: 'where do I put custom logic that runs when a CAP service request comes in' },
  { id: 'cov-cap-view-parameters',  query: 'how to define a CAP view that accepts input parameters' },
  // ── paraphrase ────────────────────────────────────────────────────────────
  { id: 'para-read-table',          query: 'get a single entry out of an internal table using its key value' },
  { id: 'para-sort-itab',           query: 'arrange the rows of an internal table into a particular order' },
  { id: 'para-collect',             query: 'accumulate numeric totals into a table summed up per key' },
  { id: 'para-delete-duplicates',   query: 'remove repeated adjacent rows from an internal table' },
  { id: 'para-try-catch',           query: 'handle a runtime error gracefully so the program does not dump' },
  { id: 'para-rtti',                query: 'inspect the type of a data object while the program is running' },
  { id: 'para-asjson',              query: 'turn an ABAP structure into a JSON string' },
  // ── coder-phrased mass ────────────────────────────────────────────────────
  { id: 'abap-raise-exception-class', query: 'RAISE EXCEPTION TYPE class based exception' },
  { id: 'abap-convert-date',          query: 'CONVERT DATE time stamp into time zone' },
]

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    queryId:   { type: 'string' },
    rankedIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['queryId', 'rankedIds'],
}

const BATCH_SCHEMA = {
  type: 'object',
  properties: { results: { type: 'array', items: ITEM_SCHEMA } },
  required: ['results'],
}

const EXISTING_SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: ITEM_SCHEMA } },
  required: ['items'],
}

// ── Load existing (skip already-collected queries) ─────────────────────────
const existingResult = await agent(
  `Use the Bash tool to run: git rev-parse --show-toplevel
Capture the output as ROOT (trim whitespace).
Then read file <ROOT>/test/eval/pairwise-vanilla.json. Return a JSON object { items: [...] } with the full array. If the file is missing return { items: [] }.`,
  { label: 'load-existing', schema: EXISTING_SCHEMA }
)

const existingMap = new Map((existingResult?.items || []).map(r => [r.queryId, r]))
const missing = QUERIES.filter(q => !existingMap.has(q.id))

if (missing.length === 0) {
  log(`All ${QUERIES.length} queries already collected — nothing to do.`)
  return Array.from(existingMap.values())
}

log(`${missing.length} missing / ${QUERIES.length - missing.length} already collected`)

// ── Collect missing queries in batches of 5 ───────────────────────────────
const vanillaTool = args?.vanillaTool ?? 'mcp-sap-docs search'

phase('Collect-Vanilla')
const batches = chunk(missing, 5)

const rawBatches = await pipeline(
  batches,
  batch => {
    const list = batch.map((q, i) => `${i + 1}. queryId="${q.id}" query="${q.query}"`).join('\n')
    return agent(
      `Use ToolSearch "${vanillaTool}" to load the search tool schema, then call the search tool once for each of these ${batch.length} queries in order:
${list}
For each call extract doc IDs from lines matching ⭐️ **<id>** (Score:...).
Return a JSON object { results: [...] } where results is an array of ${batch.length} objects in the same order: [{ queryId, rankedIds[] }]`,
      { label: `vanilla:${batch[0].id}`, phase: 'Collect-Vanilla', schema: BATCH_SCHEMA }
    )
  }
)

const fresh = rawBatches.filter(Boolean).flatMap(r => r.results || [])
log(`Collected ${fresh.length}/${missing.length} new results`)

const merged = [...existingMap.values(), ...fresh]

await agent(
  `Use the Bash tool to run: git rev-parse --show-toplevel\nCapture the output as ROOT (trim whitespace).\nThen write this JSON to <ROOT>/test/eval/pairwise-vanilla.json using the Write tool:\n${JSON.stringify(merged, null, 2)}`,
  { label: 'save', phase: 'Collect-Vanilla' }
)

log(`Saved ${merged.length} total results to pairwise-vanilla.json`)
return merged
