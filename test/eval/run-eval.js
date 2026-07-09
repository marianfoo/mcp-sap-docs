// Retrieval eval harness (roadmap "item 0").
//
// Runs the fixed query set in eval-queries.js against the built server over the
// same HTTP path the integration tests use, scores ranking quality, and prints a
// report. With --update it writes/overwrites baseline.json; otherwise it compares
// the current run against the existing baseline and flags regressions.
//
// Metrics (multi-gold: one or more gold fragments per query; hit when any gold
//          fragment appears in a result at position ≤ k):
//   - firstRelevantRank : 1-indexed position of the first ranked id matching any
//                         gold fragment; null if no gold found in the returned list.
//   - RR                : reciprocal rank (1/firstRelevantRank, else 0).
//   - hit@k             : 1 if firstRelevantRank <= k else 0, for k in {1,3,5,10}.
//   - MRR               : mean RR across queries.
//
// Usage (run via Git Bash, not PowerShell):
//   npm run build:tsc && node test/eval/run-eval.js            # run + compare to baseline
//   npm run build:tsc && node test/eval/run-eval.js --update   # run + write baseline.json
//   node test/eval/run-eval.js --json                          # machine-readable report to stdout
//
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { startServerHttp, waitForStatus, stopServer, search } from "../_utils/httpClient.js";
import EVAL_QUERIES from "./eval-queries.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, "baseline.json");
const K_VALUES = [1, 3, 5, 10];
const EVAL_K = 30; // Explicit fixed k for consistent ranking depth across baseline and live runs
const EVAL_SEARCH_OPTIONS = Object.freeze({ includeOnline: false, k: EVAL_K });

function evalVariant() {
  const fromEnv = process.env.MCP_VARIANT?.trim();
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(join(__dirname, "..", "..", ".mcp-variant"), "utf8").trim() || "sap-docs";
  } catch {
    return "sap-docs";
  }
}

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};
const paint = (t, color) => `${c[color]}${t}${c.reset}`;

const args = process.argv.slice(2);
const UPDATE = args.includes("--update");
const JSON_OUT = args.includes("--json");

// Extract the ranked list of ids, in order, from the server's formatted summary.
function parseRankedIds(text) {
  return [...String(text || "").matchAll(/^⭐️ \*\*(.+?)\*\* \(Score:/gm)].map((m) => m[1]);
}

function scoreQuery(rankedIds, expected) {
  const needles = expected.map((e) => e.toLowerCase());
  let firstRelevantRank = null;
  for (let i = 0; i < rankedIds.length; i++) {
    const id = rankedIds[i].toLowerCase();
    if (needles.some((n) => id.includes(n))) {
      firstRelevantRank = i + 1;
      break;
    }
  }
  const rr = firstRelevantRank ? 1 / firstRelevantRank : 0;
  const hit = {};
  for (const k of K_VALUES) hit[k] = firstRelevantRank && firstRelevantRank <= k ? 1 : 0;
  return { firstRelevantRank, rr, hit, returned: rankedIds.length };
}

function aggregate(rows) {
  const n = rows.length;
  const mrr = rows.reduce((s, r) => s + r.rr, 0) / n;
  const hitAtK = {};
  for (const k of K_VALUES) hitAtK[k] = rows.reduce((s, r) => s + r.hit[k], 0) / n;
  const misses = rows.filter((r) => r.firstRelevantRank === null).length;
  return { queries: n, mrr, hitAtK, misses };
}

function gitCommit() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: join(__dirname, "..", "..") })
      .toString().trim();
  } catch {
    return "unknown";
  }
}

function fmtPct(x) { return (x * 100).toFixed(1).padStart(5) + "%"; }
function fmtDelta(now, was) {
  if (was === undefined || was === null) return paint("  (new)", "dim");
  const d = now - was;
  if (Math.abs(d) < 1e-9) return paint("   ±0.0", "dim");
  const s = (d > 0 ? "+" : "") + (d * 100).toFixed(1) + "%";
  return paint(s.padStart(7), d > 0 ? "green" : "red");
}

// ── Significance ──────────────────────────────────────────────────────────────
// The eval is small, so a raw MRR delta is mostly noise. These two tests say
// whether a now-vs-baseline change is real, computed over the queries present in
// BOTH runs (paired by id). New queries can't be paired and are excluded here.
//
// 1) Paired bootstrap 95% CI on ΔMRR: resample the paired queries with
//    replacement B times; the CI is the 2.5/97.5 percentiles of mean(Δrr). If the
//    interval straddles 0, the MRR move is not distinguishable from noise.
// 2) Sign test on hit@k flips: among queries that flipped (gained or lost the
//    hit), is the gain/loss split lopsided enough to be non-random? Two-sided
//    binomial against p=0.5. Ties (no flip) are ignored, per the sign test.
function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

function bootstrapDeltaMRR(deltas, B = 10000) {
  const n = deltas.length;
  if (n === 0) return null;
  const means = new Array(B);
  for (let b = 0; b < B; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += deltas[(Math.random() * n) | 0];
    means[b] = sum / n;
  }
  means.sort((a, b) => a - b);
  const point = deltas.reduce((s, d) => s + d, 0) / n;
  return { point, lo: percentile(means, 0.025), hi: percentile(means, 0.975), n };
}

// Two-sided sign test p-value: P(|flips| as lopsided as observed) under p=0.5.
function signTestP(gain, loss) {
  const n = gain + loss;
  if (n === 0) return 1;
  const lo = Math.min(gain, loss);
  // Sum the two symmetric binomial tails: 2 * Σ_{i=0..lo} C(n,i) (0.5)^n, capped at 1.
  let logC = 0; // log C(n,0) = 0
  let tail = Math.exp(-n * Math.LN2); // C(n,0) * 0.5^n
  for (let i = 1; i <= lo; i++) {
    logC += Math.log((n - i + 1) / i); // C(n,i) from C(n,i-1)
    tail += Math.exp(logC - n * Math.LN2);
  }
  return Math.min(1, 2 * tail);
}

async function main() {
  const server = startServerHttp();
  let report;
  try {
    await waitForStatus();
    const rows = [];
    for (const q of EVAL_QUERIES) {
      const text = await search(q.query, EVAL_SEARCH_OPTIONS);
      const rankedIds = parseRankedIds(text);
      const s = scoreQuery(rankedIds, q.golds);
      rows.push({ id: q.id, category: q.category, query: q.query, golds: q.golds, ...s });
    }
    report = {
      gitCommit: gitCommit(),
      variant: evalVariant(),
      searchOptions: EVAL_SEARCH_OPTIONS,
      agg: aggregate(rows),
      rows,
      k: EVAL_K
    };
  } finally {
    await stopServer(server);
  }

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }

  const prev = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
    : null;
  const prevById = new Map((prev?.rows ?? []).map((r) => [r.id, r]));

  const baselineOptionsMatch = prev
    && prev.variant === report.variant
    && prev.searchOptions?.includeOnline === EVAL_SEARCH_OPTIONS.includeOnline
    && prev.searchOptions?.k === EVAL_SEARCH_OPTIONS.k;
  if (prev && !baselineOptionsMatch) {
    console.warn(paint(
      `⚠️ WARNING: Baseline profile (${prev.variant ?? "unknown"}, ${JSON.stringify(prev.searchOptions ?? { k: prev.k })}) does not match this run (${report.variant}, ${JSON.stringify(EVAL_SEARCH_OPTIONS)}). Results are not directly comparable.`,
      "yellow"
    ));
  }

  // ── Per-query table ──
  console.log(paint(`\nRetrieval eval — ${report.rows.length} queries @ ${report.gitCommit}`, "bold"));
  if (prev) console.log(paint(`(comparing against baseline @ ${prev.gitCommit})`, "dim"));
  console.log(paint("─".repeat(78), "dim"));
  console.log(paint("  rank  Δrank  query", "dim"));
  for (const r of report.rows) {
    const was = prevById.get(r.id);
    const rankStr = r.firstRelevantRank === null ? paint("MISS", "red") : String(r.firstRelevantRank).padStart(4);
    let dRank = "      ";
    if (was) {
      const a = was.firstRelevantRank ?? 999, b = r.firstRelevantRank ?? 999;
      if (a !== b) {
        const d = b - a; // negative = moved up = better
        dRank = paint(((d > 0 ? "+" : "") + d).padStart(5), d < 0 ? "green" : "red");
      } else dRank = paint("   ·", "dim");
    }
    const flag = r.firstRelevantRank === null ? paint(" ✗", "red") : (r.firstRelevantRank <= 3 ? paint(" ✓", "green") : paint(" ~", "yellow"));
    console.log(`${flag} ${rankStr}  ${dRank}  ${r.query}`);
  }

  // ── Aggregate ──
  const a = report.agg, pa = prev?.agg;
  console.log(paint("─".repeat(78), "dim"));
  console.log(paint("Aggregate", "bold") + paint("                 now     Δ vs baseline", "dim"));
  console.log(`  MRR              ${paint(a.mrr.toFixed(3), "cyan")}    ${fmtDelta(a.mrr, pa?.mrr)}`);
  for (const k of K_VALUES) {
    console.log(`  hit@${String(k).padEnd(2)}           ${paint(fmtPct(a.hitAtK[k]), "cyan")}    ${fmtDelta(a.hitAtK[k], pa?.hitAtK?.[k])}`);
  }
  console.log(`  misses (top-${EVAL_K})  ${paint(String(a.misses), a.misses ? "yellow" : "green")}`);
  console.log(paint("─".repeat(78), "dim"));

  // ── Significance (paired, only over queries present in both runs) ──
  if (prev) {
    const rr = (rank) => (rank ? 1 / rank : 0);
    const SIG_K = 3; // hit@k flips tested at this k
    const deltas = [];
    let gain = 0, loss = 0;
    for (const r of report.rows) {
      const was = prevById.get(r.id);
      if (!was) continue; // unpaired (new query) — excluded from the test
      deltas.push(rr(r.firstRelevantRank) - rr(was.firstRelevantRank));
      const nowHit = r.firstRelevantRank !== null && r.firstRelevantRank <= SIG_K;
      const wasHit = was.firstRelevantRank !== null && was.firstRelevantRank <= SIG_K;
      if (nowHit && !wasHit) gain++;
      else if (!nowHit && wasHit) loss++;
    }
    const unpaired = report.rows.length - deltas.length;
    console.log(paint("Significance", "bold") + paint(`  (paired over ${deltas.length} shared queries${unpaired ? `, ${unpaired} new excluded` : ""})`, "dim"));
    const ci = bootstrapDeltaMRR(deltas);
    if (ci) {
      const real = ci.lo > 0 || ci.hi < 0;
      const ciStr = `[${ci.lo >= 0 ? "+" : ""}${(ci.lo * 100).toFixed(1)}%, ${ci.hi >= 0 ? "+" : ""}${(ci.hi * 100).toFixed(1)}%]`;
      console.log(`  ΔMRR 95% CI      ${paint(ciStr, real ? (ci.point > 0 ? "green" : "red") : "yellow")}    ${real ? paint("real", "green") : paint("within noise", "yellow")}`);
    }
    const p = signTestP(gain, loss);
    const sig = p < 0.05;
    console.log(`  hit@${SIG_K} flips      ${paint(`+${gain} / -${loss}`, gain > loss ? "green" : loss > gain ? "red" : "dim")}    sign test p=${paint(p.toFixed(3), sig ? "green" : "yellow")} ${sig ? paint("real", "green") : paint("within noise", "yellow")}`);
    console.log(paint("─".repeat(78), "dim"));
  }

  if (UPDATE) {
    writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2) + "\n");
    console.log(paint(`\n✓ baseline written → ${BASELINE_PATH}`, "green"));
  } else if (!prev) {
    console.log(paint("\nNo baseline yet. Re-run with --update to record one.", "yellow"));
  }
}

main().catch((err) => {
  console.error(paint("Fatal:", "red"), err);
  process.exit(1);
});
