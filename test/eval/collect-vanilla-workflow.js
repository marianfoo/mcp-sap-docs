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

import EVAL_QUERIES from './eval-queries.js'

export const meta = {
  name: 'collect-vanilla',
  description: 'Collect vanilla MCP results (append-only, 5 queries per agent)',
  phases: [
    { title: 'Collect-Vanilla', detail: 'Batched vanilla MCP calls for missing queries only' },
  ],
}

const QUERIES = EVAL_QUERIES

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
