// Render an SAP Community post body (Khoros LiQL `body` HTML) with htmlToMarkdown vs the
// current behaviour (raw HTML inserted verbatim — see communityBestMatch.ts getCommunityPostsByIds).
//
// Usage (build first):
//   npm run build:tsc
//   node scripts/compare-community.mjs "https://community.sap.com/t5/.../ba-p/14410686"
//   node scripts/compare-community.mjs 14410686
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { htmlToMarkdown } from "../dist/src/lib/htmlToMarkdown.js";

const OUT_DIR = resolve("tmp/html-to-md");

function extractId(arg) {
  const m = String(arg).match(/(\d{5,})/g); // ba-p/<id> — take the last long number
  return m ? m[m.length - 1] : arg;
}

async function main() {
  const arg = process.argv[2] || "";
  const id = extractId(arg);
  const liql = `select body, subject, view_href from messages where id = '${id}'`.replace(/\s+/g, " ");
  const url = `https://community.sap.com/api/2.0/search?q=${encodeURIComponent(liql)}`;

  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "mcp-sap-docs/compare-community" } });
  if (!res.ok) throw new Error(`LiQL failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const post = data?.data?.items?.[0];
  if (!post) throw new Error(`No post for id ${id} (status=${data?.status})`);

  const bodyHtml = post.body || "";
  console.log(`Post: ${post.subject}\n  id=${id}  url=${post.view_href}`);

  const turndownMd = htmlToMarkdown(bodyHtml);

  mkdirSync(OUT_DIR, { recursive: true });
  const stem = `community-${id}`;
  writeFileSync(resolve(OUT_DIR, `${stem}.html`), bodyHtml);
  writeFileSync(resolve(OUT_DIR, `${stem}.turndown.md`), turndownMd);

  const htmlTags = (bodyHtml.match(/<[a-z][^>]*>/gi) || []).length;
  const mdTags = (turndownMd.match(/<[a-z][^>]*>/gi) || []).length;
  console.log("\n=== Comparison ===");
  console.table({
    "raw HTML chars": { value: bodyHtml.length },
    "raw HTML tags (current fetch dumps these)": { value: htmlTags },
    "Turndown chars": { value: turndownMd.length },
    "residual tags in Turndown MD": { value: mdTags },
    "fenced code blocks": { value: (turndownMd.match(/```/g) || []).length / 2 },
  });
  console.log(`\nArtifacts:\n  ${resolve(OUT_DIR, `${stem}.html`)}\n  ${resolve(OUT_DIR, `${stem}.turndown.md`)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
