// A/B harness: render a real SAP Help page body with Turndown vs the legacy regex
// converter, on identical HTML, so we can judge whether Turndown produces better Markdown.
//
// Usage (build first so dist/ has the converters):
//   npm run build:tsc
//   node scripts/compare-html-to-md.mjs "RAP behavior definition"
//   node scripts/compare-html-to-md.mjs "managed scenario" --version 2022.002
//
// Writes raw HTML + both Markdown renderings to tmp/html-to-md/ and prints a summary.
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { htmlToMarkdown, legacyHtmlToMarkdown } from "../dist/src/lib/htmlToMarkdown.js";

const BASE = "https://help.sap.com";
const OUT_DIR = resolve("tmp/html-to-md");

function toQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

async function getJson(url, ua) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": `mcp-sap-docs/${ua}`, Referer: BASE },
  });
  if (!res.ok) throw new Error(`${ua} failed: ${res.status} ${res.statusText}`);
  return res.json();
}

// Count rendered Markdown pipe-table rows ("| ... |") as a rough fidelity signal.
function countMdTableRows(md) {
  return (md.match(/^\s*\|.*\|\s*$/gm) || []).length;
}

// Resolve a docs page from search (query mode) or directly from a docs URL (--url mode).
// Returns { loio, title, product_url, deliverable_url, topic_url, language, url }.
async function resolveTarget(args, version) {
  const urlIdx = args.indexOf("--url");
  if (urlIdx >= 0) {
    const pageUrl = args[urlIdx + 1];
    const u = new URL(pageUrl, BASE);
    const parts = u.pathname.split("/").filter(Boolean); // docs/{product}/{deliverable}/{file}.html
    if (parts[0] !== "docs" || parts.length < 4) throw new Error(`Not a docs URL: ${pageUrl}`);
    const loio = parts[3].replace(/\.html?$/i, "");
    return {
      loio,
      title: loio,
      product_url: parts[1],
      deliverable_url: parts[2],
      topic_url: parts[3],
      language: "en-US",
      url: u.href,
    };
  }

  const query = args
    .filter((a, i) => a !== "--version" && args[i - 1] !== "--version")
    .join(" ")
    .trim() || "RAP behavior definition";
  console.log(`Query: "${query}"${version ? `  version=${version}` : ""}`);

  const searchUrl = `${BASE}/http.svc/elasticsearch?${toQuery({
    transtype: "standard,html,pdf,others",
    state: "PRODUCTION,TEST,DRAFT",
    product: "",
    version,
    q: query,
    to: "19",
    area: "content",
    advancedSearch: "0",
    excludeNotSearchable: "1",
    language: "en-US",
  })}`;
  const search = await getJson(searchUrl, "compare-search");
  const results = search?.data?.results || [];
  const hit = results.find((r) => r.loio && r.loio !== "undefined" && r.loio !== "null");
  if (!hit) throw new Error("No result with a LOIO page id for that query. Try another query.");
  const parts = new URL(hit.url, BASE).pathname.split("/").filter(Boolean);
  return {
    loio: hit.loio,
    title: hit.title,
    product_url: hit.productId || parts[1],
    deliverable_url: parts[2],
    topic_url: `${hit.loio}.html`,
    language: hit.language || "en-US",
    url: new URL(hit.url, BASE).href,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const versionIdx = args.indexOf("--version");
  const version = versionIdx >= 0 ? args[versionIdx + 1] : "";

  const hit = await resolveTarget(args, version);
  console.log(`Hit: ${hit.title}\n  loio=${hit.loio}  product=${hit.product_url}  url=${hit.url}`);

  // deliverableMetadata → deliverable_id / buildNo / file_path
  const metaUrl = `${BASE}/http.svc/deliverableMetadata?${toQuery({
    product_url: hit.product_url,
    topic_url: hit.topic_url,
    version: version || "LATEST",
    loadlandingpageontopicnotfound: "true",
    deliverable_url: hit.deliverable_url,
    language: hit.language,
    deliverableInfo: "1",
    toc: "1",
  })}`;
  const meta = await getJson(metaUrl, "compare-metadata");
  const deliverable_id = meta?.data?.deliverable?.id;
  const buildNo = meta?.data?.deliverable?.buildNo;
  const file_path = meta?.data?.filePath || `${hit.loio}.html`;
  if (!deliverable_id || !buildNo) {
    console.error("Metadata did not return deliverable_id/buildNo.");
    process.exit(1);
  }

  // 3) pagecontent → raw body HTML
  const pageUrl = `${BASE}/http.svc/pagecontent?${toQuery({ deliverableInfo: "1", deliverable_id, buildNo, file_path })}`;
  const page = await getJson(pageUrl, "compare-content");
  const bodyHtml = page?.data?.body || "";
  if (!bodyHtml) {
    console.error("pagecontent returned an empty body.");
    process.exit(1);
  }

  // Render both ways on the identical HTML.
  const turndownMd = htmlToMarkdown(bodyHtml);
  const legacyMd = legacyHtmlToMarkdown(bodyHtml);

  mkdirSync(OUT_DIR, { recursive: true });
  const stem = `${hit.loio}${version ? `--v${version}` : ""}`;
  const htmlPath = resolve(OUT_DIR, `${stem}.html`);
  const turndownPath = resolve(OUT_DIR, `${stem}.turndown.md`);
  const legacyPath = resolve(OUT_DIR, `${stem}.legacy.md`);
  writeFileSync(htmlPath, bodyHtml);
  writeFileSync(turndownPath, turndownMd);
  writeFileSync(legacyPath, legacyMd);

  const htmlTables = (bodyHtml.match(/<table[\s>]/gi) || []).length;
  console.log("\n=== Comparison ===");
  console.table({
    "HTML <table> count": { value: htmlTables },
    "raw HTML chars": { value: bodyHtml.length },
    "Turndown chars": { value: turndownMd.length },
    "legacy chars": { value: legacyMd.length },
    "Turndown table rows": { value: countMdTableRows(turndownMd) },
    "legacy table rows": { value: countMdTableRows(legacyMd) },
  });
  console.log(`\nArtifacts:\n  ${htmlPath}\n  ${turndownPath}\n  ${legacyPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
