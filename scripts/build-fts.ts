import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

type Doc = {
  id: string;
  relFile: string;
  title: string;
  description: string;
  snippetCount: number;
  type?: string;
  controlName?: string;
  namespace?: string;
  keywords?: string[];
  properties?: string[];
  events?: string[];
  aggregations?: string[];
};

type LibraryBundle = {
  id: string;          // "/sapui5" | "/cap" | "/openui5-api" | "/openui5-samples" | "/wdi5"
  name: string;
  description: string;
  docs: Doc[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const SRC = path.join(DATA_DIR, "index.json");
const DST = path.join(DATA_DIR, "docs.sqlite");

function libFromId(id: string): string {
  // id looks like "/sapui5/..." etc.
  const m = id.match(/^\/[^/]+/);
  return m ? m[0] : "";
}

function safeText(x: unknown): string {
  if (!x) return "";
  if (Array.isArray(x)) return x.join(" ");
  return String(x);
}

function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`Missing ${SRC}. Run npm run build:index first.`);
  }
  
  console.log(`📖 Reading index from ${SRC}...`);
  const raw = JSON.parse(fs.readFileSync(SRC, "utf8")) as Record<string, LibraryBundle>;

  // Fresh DB
  if (fs.existsSync(DST)) {
    console.log(`🗑️  Removing existing ${DST}...`);
    fs.unlinkSync(DST);
  }
  
  console.log(`🏗️  Creating FTS5 database at ${DST}...`);
  const db = new Database(DST);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("temp_store = MEMORY");

  // FTS5 schema: columns you want to search get indexed; metadata can be UNINDEXED
  // We keep this simple - FTS is just for fast candidate filtering
  db.exec(`
    CREATE VIRTUAL TABLE docs USING fts5(
      libraryId,                  -- indexed for filtering
      type,                       -- markdown/jsdoc/sample (indexed for filtering)
      title,                      -- strong signal for search
      description,                -- weaker signal for search
      keywords,                   -- control tags and properties
      controlName,                -- e.g., Wizard, Button
      namespace,                  -- e.g., sap.m, sap.f
      id UNINDEXED,               -- metadata (full path id)
      relFile UNINDEXED,          -- metadata
      snippetCount UNINDEXED      -- metadata
    );
  `);

  console.log(`📝 Inserting documents into FTS5 index...`);
  const ins = db.prepare(`
    INSERT INTO docs (libraryId,type,title,description,keywords,controlName,namespace,id,relFile,snippetCount)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);

  let totalDocs = 0;
  const tx = db.transaction(() => {
    for (const lib of Object.values(raw)) {
      for (const d of lib.docs) {
        const libraryId = libFromId(d.id);
        const keywords = safeText(d.keywords);
        const props = safeText(d.properties);
        const events = safeText(d.events);
        const aggs = safeText(d.aggregations);
        
        // Combine all searchable keywords
        const keywordsAll = [keywords, props, events, aggs].filter(Boolean).join(" ");

        ins.run(
          libraryId,
          d.type ?? "",
          safeText(d.title),
          safeText(d.description),
          keywordsAll,
          safeText(d.controlName),
          safeText(d.namespace),
          d.id,
          d.relFile,
          d.snippetCount ?? 0
        );
        totalDocs++;
      }
    }
  });

  tx();
  
  console.log(`📊 Optimizing FTS5 index...`);
  db.pragma("optimize");
  
  // Get some stats
  const rowCount = db.prepare("SELECT count(*) as n FROM docs").get() as { n: number };
  
  db.close();

  console.log(`✅ FTS5 index built successfully!`);
  console.log(`   📄 Documents indexed: ${totalDocs}`);
  console.log(`   📄 Rows in FTS table: ${rowCount.n}`);
  console.log(`   💾 Database size: ${(fs.statSync(DST).size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   📍 Location: ${DST}`);
}

// ES module equivalent of require.main === module
import { fileURLToPath } from 'url';
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error("❌ Error building FTS index:", error);
    process.exit(1);
  }
}