// A/B eval for the SAP Help product-scoping fix (online-merge pollution).
//
// The fix is opt-in via `abapFlavor`: `auto` reproduces the EXACT pre-fix unscoped online leg, an
// explicit flavor ('standard'/'cloud') is the post-fix scoped leg. So we can measure before/after on
// ONE build by toggling the flag — no checkout dance.
//
// Two levels, both reproducible:
//   (1) ONLINE LEG (searchSapHelp, product-labelled) — for each query, how many of the top-10 online
//       SAP Help hits are off-topic (non-ABAP product). This is the pollution metric.
//   (2) MERGED RANKING (search) — rank of the canonical ABAP doc (taken as the scoped leg's own top
//       ABAP hits) in the merged top-10, unscoped vs scoped. This is the user-facing gain.
//
// Usage (Git Bash or PowerShell): NODE_USE_SYSTEM_CA=1 node test/eval/run-scope-eval.js [--json]
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { searchSapHelp, ABAP_HELP_PRODUCTS } from "../../dist/src/lib/sapHelp.js";
import { search } from "../../dist/src/lib/search.js";
import QUERIES from "./online-scope-queries.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_PATH = join(__dirname, "scope-eval-baseline.json");
const TOPN = 10;

const isValidLoio = (l) => !!l && l !== "undefined" && l !== "null";
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// On-target = the hit's product matches the query's intended scope family (coreToken). Everything
// else is off-target noise for that query (SQL Anywhere / BW for an ABAP query; SAP ERP / BI Content
// for a functional S/4 query).
const isOnTarget = (product, coreToken) => norm(product).includes(coreToken);

const topProducts = (resp) =>
  (resp.results || []).slice(0, TOPN).map((r) => r.metadata?.product || r.metadata?.productId || "Unknown");

const rankOfGold = (resp, goldLoios) => {
  const ids = (resp || []).map((r) => String(r.id || "").toLowerCase());
  for (let i = 0; i < ids.length; i++) {
    if (goldLoios.some((g) => ids[i].includes(g.toLowerCase()))) return i + 1;
  }
  return null;
};

async function evalQuery(q) {
  // Scope target: explicit functional product, else the abapFlavor-derived ABAP product.
  const product = q.product || ABAP_HELP_PRODUCTS[q.flavor];
  // How the merged scoped run is invoked: explicit `product`, or the `abapFlavor` path.
  const scopedOpts = q.product ? { product: q.product } : { abapFlavor: q.flavor };

  // (1) online leg, product-labelled
  const legUnscoped = await searchSapHelp(q.query, "", "");
  const legScoped = await searchSapHelp(q.query, "", product);
  const offUnscoped = topProducts(legUnscoped).filter((p) => !isOnTarget(p, q.coreToken));
  const offScoped = topProducts(legScoped).filter((p) => !isOnTarget(p, q.coreToken));

  // canonical answer(s) = the scoped leg's own top valid loios (self-consistent, not hand-picked)
  const goldLoios = (legScoped.results || [])
    .map((r) => r.metadata?.loio)
    .filter(isValidLoio)
    .slice(0, 5);

  // (2) merged ranking, unscoped (pre-fix) vs scoped (post-fix)
  const mergedUnscoped = await search(q.query, { includeOnline: true, abapFlavor: "auto", k: 20 });
  const mergedScoped = await search(q.query, { includeOnline: true, k: 20, ...scopedOpts });
  const goldRankUnscoped = rankOfGold(mergedUnscoped, goldLoios);
  const goldRankScoped = rankOfGold(mergedScoped, goldLoios);

  return {
    id: q.id,
    query: q.query,
    scope: product,
    via: q.product ? "product" : "abapFlavor",
    offTopicUnscoped: offUnscoped.length,
    offTopicScoped: offScoped.length,
    offTopicProducts: [...new Set(offUnscoped)],
    goldRankUnscoped,
    goldRankScoped,
  };
}

async function main() {
  const rows = [];
  for (const q of QUERIES) rows.push(await evalQuery(q));

  const rr = (r) => (r ? 1 / r : 0);
  const n = rows.length;
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const mrrU = sum((r) => rr(r.goldRankUnscoped)) / n;
  const mrrS = sum((r) => rr(r.goldRankScoped)) / n;
  const hitU = sum((r) => (r.goldRankUnscoped && r.goldRankUnscoped <= TOPN ? 1 : 0));
  const hitS = sum((r) => (r.goldRankScoped && r.goldRankScoped <= TOPN ? 1 : 0));
  const totOffU = sum((r) => r.offTopicUnscoped);
  const totOffS = sum((r) => r.offTopicScoped);

  // Write a clean artifact via fs (bypasses the search modules' stdout logging).
  const agg = {
    queries: n, topN: TOPN,
    offTopicOnline: { unscoped: totOffU, scoped: totOffS, of: n * TOPN },
    goldHitAtTopN: { unscoped: hitU, scoped: hitS },
    goldMrr: { unscoped: +mrrU.toFixed(4), scoped: +mrrS.toFixed(4) },
  };
  writeFileSync(ARTIFACT_PATH, JSON.stringify({ agg, rows }, null, 2) + "\n");

  console.log(`\nSAP Help product-scoping — A/B over ${n} conceptual ABAP queries (top-${TOPN})\n` + "─".repeat(92));
  console.log(
    "query".padEnd(52) +
      "off-topic online   ".padStart(0) +
      "gold rank (merged)"
  );
  console.log("".padEnd(52) + "UNSCOPED→SCOPED   UNSCOPED→SCOPED");
  console.log("─".repeat(92));
  for (const r of rows) {
    const off = `${String(r.offTopicUnscoped).padStart(2)}/10  →  ${String(r.offTopicScoped).padStart(2)}/10`;
    const gu = r.goldRankUnscoped ?? "MISS";
    const gs = r.goldRankScoped ?? "MISS";
    console.log(`${r.query.slice(0, 50).padEnd(52)}${off}     ${String(gu).padStart(4)} → ${String(gs).padStart(4)}`);
    if (r.offTopicProducts.length) {
      console.log(`  └─ unscoped off-topic products: ${r.offTopicProducts.join(", ")}`);
    }
  }
  console.log("─".repeat(92));
  console.log(`off-topic online hits (total of top-${TOPN}):   ${totOffU}  →  ${totOffS}`);
  console.log(`gold doc hit@${TOPN} (merged):                  ${hitU}/${n}  →  ${hitS}/${n}`);
  console.log(`gold doc MRR (merged):                      ${mrrU.toFixed(3)}  →  ${mrrS.toFixed(3)}`);
  console.log("─".repeat(92));
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
