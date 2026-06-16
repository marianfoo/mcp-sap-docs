// Retrieval eval harness (roadmap "item 0").
//
// Runs the fixed query set in eval-queries.js against the built server over the
// same HTTP path the integration tests use, scores ranking quality, and prints a
// report. With --update it writes/overwrites baseline.json; otherwise it compares
// the current run against the existing baseline and flags regressions.
//
// Metrics (single known-good target per query, so recall@k == success@k == hit@k):
//   - firstRelevantRank : 1-indexed position of the first ranked id matching any
//                         `expected` fragment; null if absent from the returned list.
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
import { startServerHttp, waitForStatus, stopServer, docsSearch } from "../_utils/httpClient.js";
import EVAL_QUERIES from "./eval-queries.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, "baseline.json");
const K_VALUES = [1, 3, 5, 10];

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

async function main() {
  const server = startServerHttp();
  let report;
  try {
    await waitForStatus();
    const rows = [];
    for (const q of EVAL_QUERIES) {
      const text = await docsSearch(q.query);
      const rankedIds = parseRankedIds(text);
      const s = scoreQuery(rankedIds, q.expected);
      rows.push({ id: q.id, category: q.category, query: q.query, expected: q.expected, ...s });
    }
    report = { gitCommit: gitCommit(), agg: aggregate(rows), rows };
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
  console.log(`  misses (top-50)  ${paint(String(a.misses), a.misses ? "yellow" : "green")}`);
  console.log(paint("─".repeat(78), "dim"));

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
