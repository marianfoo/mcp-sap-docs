// Pairwise LLM-as-judge eval: local MCP vs vanilla MCP.
//
// Prereq: test/eval/pairwise-vanilla.json must exist (run collect-vanilla-workflow.js once).
// Invoke: Workflow({ scriptPath: 'test/eval/pairwise-eval-workflow.js' })
// Args:   { localTool?: string }  ToolSearch query for the local server's search tool.
//         Default: 'mcp-sap-docs-test search'. Use 'select:mcp__my-server__search' for an
//         exact lookup, or a keyword fragment like 'my-server search' for fuzzy matching.
//
// Limitation: presentation order is not swapped (A=local always shown first). This
// introduces a potential positional bias in the LLM judge. Results should be read as
// directional, not definitive — consistent win margins matter more than raw win counts.
//
// Agent count: ~9 collect-batches + 1 read-vanilla + ~6 judge-batches ≈ 16 total

export const meta = {
  name: 'pairwise-eval',
  description: 'Pairwise LLM-as-judge eval: local MCP (reranker on) vs vanilla MCP for 44 eval queries',
  phases: [
    { title: 'Collect-Local', detail: 'Batched local MCP calls — 5 queries per agent' },
    { title: 'Read-Vanilla',  detail: 'Load vanilla baseline from pairwise-vanilla.json' },
    { title: 'Judge',         detail: 'Batched LLM judge — 8 pairs per agent' },
  ],
}

const QUERIES = [
  // ── ABAP language ──────────────────────────────────────────────────────────
  { id: 'abap-regex-pcre',          category: 'abap-regex',       query: 'FIND PCRE regex with unicode character property class',                              golds: ['ABENREGEX_PCRE_SYNTAX'] },
  { id: 'abap-gzip',                category: 'abap-api',         query: 'compress binary data with CL_ABAP_GZIP',                                             golds: ['ABENCL_ABAP_GZIP'] },
  { id: 'abap-string-templates',    category: 'abap-strings',     query: 'string template formatting options in ABAP',                                         golds: ['ABENSTRING_TEMPLATES_PREDEF_FORMAT', 'ABENSTRING_TEMPLATES'] },
  { id: 'abap-authority-check',     category: 'abap-security',    query: 'perform an authority check in ABAP',                                                 golds: ['ABAPAUTHORITY-CHECK', 'ABENBC_AUTHORITY_CHECK'] },
  { id: 'abap-for-all-entries',     category: 'abap-sql',         query: 'SELECT FOR ALL ENTRIES performance',                                                 golds: ['ABENWHERE_ALL_ENTRIES', 'FOR_ALL_ENTRIES'] },
  { id: 'abap-loop-group-by',       category: 'abap-itab',        query: 'loop at internal table group by',                                                    golds: ['ABAPLOOP_AT_GROUP', 'LOOP_AT_ITAB_GROUP_BY'] },
  { id: 'abap-secondary-key',       category: 'abap-itab',        query: 'secondary internal table key sorted hashed',                                         golds: ['SECONDARY_KEY', '01_Internal_Tables'] },
  { id: 'abap-unit-test',           category: 'abap-test',        query: 'ABAP unit test class for testing methods',                                           golds: ['ABAPCLASS_FOR_TESTING', 'ABAPMETHODS_TESTING'] },
  // ── CDS ────────────────────────────────────────────────────────────────────
  { id: 'cds-define-view',          category: 'cds',              query: 'define CDS view entity with select from',                                            golds: ['ABENCDS_DEFINE_VIEW_ENTITY'] },
  { id: 'cds-value-help-annotation',category: 'cds-annotation',   query: 'value help annotation for a CDS field',                                              golds: ['ABENCDS_F1_DEFINE_ANNOTATION_TYPE', 'field-help', 'valueHelp'] },
  // ── RAP ────────────────────────────────────────────────────────────────────
  { id: 'rap-determination',        category: 'rap',              query: 'RAP determination on save in behavior definition',                                   golds: ['ABENBDL_DETERMINATIONS'] },
  { id: 'rap-eml-modify',           category: 'rap-eml',          query: 'modify entity with EML in RAP',                                                      golds: ['ABAPMODIFY_ENTITY_ENTITIES_OP', '08_EML'] },
  // ── UI5 / Fiori Elements ───────────────────────────────────────────────────
  { id: 'ui5-two-way-binding',      category: 'ui5',              query: 'JSONModel two way data binding in UI5',                                              golds: ['two-way-data-binding', 'data-binding-68b9644', 'odata-v2-model'] },
  { id: 'ui5-growing-table',        category: 'ui5',              query: 'growing table scroll in sap.m.Table',                                               golds: ['growing-feature-for-table-and-list', 'GrowingList'] },
  { id: 'ui5-fiori-elements-lineitem', category: 'fiori-elements', query: 'fiori elements list report line item annotation',                                   golds: ['06_SAP_Fiori_Elements', 'LineItem'] },
  // ── wdi5 ───────────────────────────────────────────────────────────────────
  { id: 'wdi5-locator',             category: 'wdi5',             query: 'wdi5 locator to click a button',                                                     golds: ['/wdi5/locators', '/wdi5/usage'] },
  // ── CAP ────────────────────────────────────────────────────────────────────
  { id: 'cap-associations',         category: 'cap',              query: 'define entity associations in CAP',                                                  golds: ['/cap/guides/domain-modeling#associations', '/cap/cds/cdl'] },
  { id: 'cap-expose-projection',    category: 'cap',              query: 'expose entities as a projection in a CAP service',                                   golds: ['/cap/cds/cdl#exposed-entities', '/cap/guides/using-services'] },
  // ── BTP ────────────────────────────────────────────────────────────────────
  { id: 'btp-destination',          category: 'btp',              query: 'BTP destination service for connectivity',                                           golds: ['btp-destination-service', 'destination'] },
  // ── lexical-gap ───────────────────────────────────────────────────────────
  { id: 'abap-gzip-lexical',              category: 'lexical-gap',    query: 'reduce the size of a byte string in memory before storing it',                  golds: ['ABENCL_ABAP_GZIP', 'SCMS_XSTRING_COMPRESS'] },
  { id: 'abap-authority-check-lexical',   category: 'lexical-gap',    query: 'check whether the logged-in user is allowed to perform this action',            golds: ['ABAPAUTHORITY-CHECK', 'ABENBC_AUTHORITY_CHECK'] },
  { id: 'abap-for-all-entries-lexical',   category: 'lexical-gap',    query: 'read database rows for every key stored in an internal table',                  golds: ['ABENWHERE_ALL_ENTRIES', 'FOR_ALL_ENTRIES'] },
  // ── best-practice ─────────────────────────────────────────────────────────
  { id: 'best-exceptions-vs-returncodes', category: 'best-practice',  query: 'what is the recommended way to signal a failure from an ABAP method',          golds: ['prefer-exceptions-to-return-codes'] },
  { id: 'best-composition-vs-inheritance',category: 'best-practice',  query: 'is it better to extend a class or wrap it when reusing behavior in ABAP',      golds: ['prefer-composition-to-inheritance'] },
  { id: 'best-new-vs-create-object',      category: 'best-practice',  query: 'recommended way to instantiate a class in modern ABAP',                        golds: ['prefer-new-to-create-object'] },
  { id: 'best-package-architecture',      category: 'best-practice',  query: 'how should I organize packages for a maintainable SAP application',             golds: ['architecture_and_structure', 'package-strategy'] },
  // ── coverage-test ─────────────────────────────────────────────────────────
  { id: 'cov-read-table-vs-loop',   category: 'coverage-test',    query: 'fastest way to find one record in an internal table without looping over it',       golds: ['prefer-read-table-to-loop-at'] },
  { id: 'cov-line-exists',          category: 'coverage-test',    query: 'how to check whether a row exists in a table without reading it into a variable',   golds: ['prefer-line-exists-to-read-table-or-loop-at'] },
  { id: 'cov-insert-vs-append',     category: 'coverage-test',    query: 'recommended statement to add rows to a sorted or hashed internal table',            golds: ['prefer-insert-into-table-to-append-to'] },
  { id: 'cov-avoid-default-key',    category: 'coverage-test',    query: 'why you should not rely on the standard table key when looking up rows',             golds: ['avoid-default-key'] },
  { id: 'cov-inline-declarations',  category: 'coverage-test',    query: 'should I declare variables up front or inline where they are first used',           golds: ['prefer-inline-to-up-front-declarations'] },
  { id: 'cov-oo-vs-procedural',     category: 'coverage-test',    query: 'is it better to write new business logic in classes or in reports and function modules', golds: ['prefer-object-orientation-to-procedural-programming'] },
  { id: 'cov-loop-where-vs-if',     category: 'coverage-test',    query: 'cleaner way to skip rows in a loop instead of wrapping the body in an if',         golds: ['prefer-loop-at-where-to-nested-if'] },
  { id: 'cov-cap-event-handlers',   category: 'coverage-test',    query: 'where do I put custom logic that runs when a CAP service request comes in',         golds: ['providing-services#event-handlers'] },
  { id: 'cov-cap-view-parameters',  category: 'coverage-test',    query: 'how to define a CAP view that accepts input parameters',                            golds: ['cdl#views-with-parameters'] },
  // ── paraphrase ────────────────────────────────────────────────────────────
  { id: 'para-read-table',          category: 'lexical-gap',      query: 'get a single entry out of an internal table using its key value',                   golds: ['ABAPREAD_TABLE'] },
  { id: 'para-sort-itab',           category: 'lexical-gap',      query: 'arrange the rows of an internal table into a particular order',                     golds: ['ABAPSORT_ITAB'] },
  { id: 'para-collect',             category: 'lexical-gap',      query: 'accumulate numeric totals into a table summed up per key',                          golds: ['ABAPCOLLECT'] },
  { id: 'para-delete-duplicates',   category: 'lexical-gap',      query: 'remove repeated adjacent rows from an internal table',                              golds: ['ABAPDELETE_DUPLICATES'] },
  { id: 'para-try-catch',           category: 'lexical-gap',      query: 'handle a runtime error gracefully so the program does not dump',                    golds: ['ABAPTRY'] },
  { id: 'para-rtti',                category: 'lexical-gap',      query: 'inspect the type of a data object while the program is running',                    golds: ['ABENRTTI'] },
  { id: 'para-asjson',              category: 'lexical-gap',      query: 'turn an ABAP structure into a JSON string',                                         golds: ['ABENABAP_ASJSON'] },
  // ── coder-phrased mass ────────────────────────────────────────────────────
  { id: 'abap-raise-exception-class', category: 'abap-exceptions', query: 'RAISE EXCEPTION TYPE class based exception',                                       golds: ['ABAPRAISE_EXCEPTION_CLASS', 'ABAPRAISE_EXCEPTION'] },
  { id: 'abap-convert-date',          category: 'abap-datetime',   query: 'CONVERT DATE time stamp into time zone',                                           golds: ['ABAPCONVERT_DATE'] },
]

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const BATCH_COLLECT_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          queryId:   { type: 'string' },
          rankedIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['queryId', 'rankedIds'],
      },
    },
  },
  required: ['results'],
}

const BATCH_JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    judgments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          queryId:   { type: 'string' },
          winner:    { type: 'string', enum: ['A', 'tie', 'B'] },
          reasoning: { type: 'string' },
        },
        required: ['queryId', 'winner', 'reasoning'],
      },
    },
  },
  required: ['judgments'],
}

const localTool = args?.localTool ?? 'mcp-sap-docs-test search'

// ── Phase 1: collect local (5 queries per agent) ───────────────────────────
phase('Collect-Local')
const collectBatches = chunk(QUERIES, 5)
log(`${QUERIES.length} queries → ${collectBatches.length} batches`)

const rawLocalBatches = await pipeline(
  collectBatches,
  batch => {
    const list = batch.map((q, i) => `${i + 1}. queryId="${q.id}" query="${q.query}"`).join('\n')
    return agent(
      `Use ToolSearch "${localTool}" to load the search tool schema, then call the search tool once for each of these ${batch.length} queries in order:
${list}
For each call extract doc IDs from lines matching ⭐️ **<id>** (Score:...).
Return a JSON object { results: [...] } where results is an array of ${batch.length} objects in the same order: [{ queryId, rankedIds[] }]`,
      { label: `local:${batch[0].id}`, phase: 'Collect-Local', schema: BATCH_COLLECT_SCHEMA }
    )
  }
)

const localResults = rawLocalBatches.filter(Boolean).flatMap(r => r.results || [])
log(`Collected ${localResults.length}/${QUERIES.length} local results`)

// ── Phase 2: read vanilla baseline ────────────────────────────────────────
phase('Read-Vanilla')
const vanillaRawResult = await agent(
  `Use the Bash tool to run: git rev-parse --show-toplevel
Capture the output as ROOT (trim whitespace).
Then run this command using the Bash tool (cwd: ROOT):

node -e "const d=require('./test/eval/pairwise-vanilla.json'); process.stdout.write(JSON.stringify({items: d.map(r=>({queryId:r.queryId,rankedIds:(r.rankedIds||[]).slice(0,15)}))}))"

Capture stdout and return the JSON object it prints.`,
  {
    label: 'read-vanilla',
    phase: 'Read-Vanilla',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              queryId:   { type: 'string' },
              rankedIds: { type: 'array', items: { type: 'string' } },
            },
            required: ['queryId', 'rankedIds'],
          },
        },
      },
      required: ['items'],
    },
  }
)

const vanillaRaw = vanillaRawResult?.items || []

if (!vanillaRaw || vanillaRaw.length === 0) {
  log('BLOCKED: pairwise-vanilla.json missing — run collect-vanilla-workflow.js first.')
  return { error: 'vanilla_results_missing', localResults }
}

const vanillaMap = new Map(vanillaRaw.map(r => [r.queryId, r]))
const localMap   = new Map(localResults.map(r => [r.queryId, r]))

const paired = QUERIES
  .filter(q => localMap.has(q.id) && vanillaMap.has(q.id))
  .map(q => ({
    id:       q.id,
    category: q.category,
    query:    q.query,
    golds: q.golds,
    local:    localMap.get(q.id),
    vanilla:  vanillaMap.get(q.id),
  }))

log(`${paired.length} pairs ready for judgment`)

// ── Phase 3: judge (8 pairs per agent) ────────────────────────────────────
phase('Judge')
const judgeBatches = chunk(paired, 8)

const rawJudgeBatches = await pipeline(
  judgeBatches,
  batch => {
    const pairText = batch.map((p, i) => {
      const a = p.local.rankedIds.slice(0, 10).map((id, j) => `  ${j + 1}. ${id}`).join('\n')
      const b = p.vanilla.rankedIds.slice(0, 10).map((id, j) => `  ${j + 1}. ${id}`).join('\n')
      return `--- ${i + 1}. queryId="${p.id}" ---
Query: "${p.query}"
Gold IDs (any case-insensitive substring match = hit): ${JSON.stringify(p.golds)}
System A (local+reranker):
${a}
System B (vanilla):
${b}`
    }).join('\n\n')

    return agent(
      `Search quality judge. Evaluate ${batch.length} pairs.
Priority: (1) gold doc nearest rank 1 wins; (2) if no hit, topical relevance of top results; (3) fewer off-topic results in top 5.

${pairText}

Return a JSON object { judgments: [...] } where judgments is an array of ${batch.length} objects in the SAME ORDER: [{ queryId, winner: "A"|"tie"|"B", reasoning }]`,
      { label: `judge:${batch[0].id}`, phase: 'Judge', schema: BATCH_JUDGE_SCHEMA }
    )
  }
)

const judged = rawJudgeBatches.filter(Boolean).flatMap(r => r.judgments || [])

// ── Aggregate ──────────────────────────────────────────────────────────────
const wins = { A: 0, B: 0, tie: 0 }
judged.forEach(j => { if (j.winner in wins) wins[j.winner]++ })

const pct  = n => judged.length ? `${(n / judged.length * 100).toFixed(1)}%` : 'N/A'
const summary = `A (local+reranker) ${wins.A} (${pct(wins.A)}) | B (vanilla) ${wins.B} (${pct(wins.B)}) | tie ${wins.tie} | n=${judged.length}`
log(summary)

const catWins = {}
judged.forEach(j => {
  const q   = QUERIES.find(q => q.id === j.queryId)
  const cat = q ? q.category : 'unknown'
  if (!catWins[cat]) catWins[cat] = { A: 0, B: 0, tie: 0 }
  if (j.winner in catWins[cat]) catWins[cat][j.winner]++
})
Object.entries(catWins).forEach(([cat, w]) => log(`  ${cat}: A=${w.A} B=${w.B} tie=${w.tie}`))

return { summary, wins, byCategory: catWins, judgments: judged, localResults }
