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

import EVAL_QUERIES from './eval-queries.js'

export const meta = {
  name: 'pairwise-eval',
  description: 'Pairwise LLM-as-judge eval: local MCP (reranker on) vs vanilla MCP for 44 eval queries',
  phases: [
    { title: 'Collect-Local', detail: 'Batched local MCP calls — 5 queries per agent' },
    { title: 'Read-Vanilla',  detail: 'Load vanilla baseline from pairwise-vanilla.json' },
    { title: 'Judge',         detail: 'Batched LLM judge — 8 pairs per agent' },
  ],
}

const QUERIES = EVAL_QUERIES

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
