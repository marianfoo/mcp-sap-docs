import { spawnSync } from "child_process";
import fs from "fs/promises";
import path from "path";

export type OpenUxGeneratedSource = {
  libraryId: string;
  outputDir: string;
  inputFiles: string[];
  defaultTags: string[];
};

export type MaterializeOptions = {
  dataLocalDir?: string;
  outputRoot?: string;
  openUxRepoDir?: string;
  commitSha?: string;
  sources?: OpenUxGeneratedSource[];
  clean?: boolean;
};

type Chunk = {
  content: string;
  startLine: number;
  endLine: number;
};

export const OPENUX_DATA_LOCAL_DIR = path.join(
  "sources",
  "open-ux-tools",
  "packages",
  "fiori-docs-embeddings",
  "data_local"
);

export const OPENUX_GENERATED_OUTPUT_ROOT = path.join("sources", "openux-generated");

export const OPENUX_GENERATED_SOURCES: OpenUxGeneratedSource[] = [
  {
    libraryId: "/fiori-development-portal",
    outputDir: "fiori-development-portal",
    inputFiles: ["fiori_development_portal.md", "fiori_development_portal_extension.md"],
    defaultTags: ["fiori-elements", "development-portal", "sap.fe", "fpm", "building-blocks"]
  },
  {
    libraryId: "/sap-fe-test-api",
    outputDir: "sap-fe-test-api",
    inputFiles: ["sap_fe_test_api.md"],
    defaultTags: ["sap.fe.test", "opa5", "testing", "api"]
  },
  {
    libraryId: "/fiori-tools-suite",
    outputDir: "fiori-tools-suite",
    inputFiles: ["tools-suite.md"],
    defaultTags: ["fiori-tools", "commands", "vscode", "bas"]
  },
  {
    libraryId: "/fiori-opa5-docu",
    outputDir: "fiori-opa5-docu",
    inputFiles: ["opa5_docu.md"],
    defaultTags: ["opa5", "integration-tests", "fiori-elements", "sap.fe.test"]
  },
  {
    libraryId: "/fiori-extension-instructions",
    outputDir: "fiori-extension-instructions",
    inputFiles: ["fiori_extension_instructions.md"],
    defaultTags: ["fiori-elements", "extensions", "controller-extension", "fragments"]
  },
  {
    libraryId: "/ux-ui5-tooling",
    outputDir: "ux-ui5-tooling",
    inputFiles: ["ux-ui5-tooling-README.md"],
    defaultTags: ["fiori-tools", "ui5-tooling", "middleware", "tasks", "cli"]
  }
];

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[`*_()[\]{}'"<>]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  return slug || "chunk";
}

function yamlString(value: string): string {
  return JSON.stringify(value.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
}

function extractField(content: string, field: string): string | null {
  const match = content.match(new RegExp(`\\*\\*${field}\\*\\*:\\s*(.+)`, "i"));
  return match ? match[1].trim() : null;
}

function extractTitle(content: string, fallback: string): string {
  return (
    extractField(content, "TITLE") ||
    content.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    fallback
  );
}

function extractDescription(content: string, title: string): string {
  const introduction = extractField(content, "INTRODUCTION");
  if (introduction) {
    return introduction.replace(/\s+/g, " ").slice(0, 400);
  }

  const description = extractField(content, "DESCRIPTION");
  if (description) {
    return description.replace(/\s+/g, " ").slice(0, 400);
  }

  const firstTextLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !line.startsWith("**") && line !== "---");

  return (firstTextLine || title).replace(/\s+/g, " ").slice(0, 400);
}

function extractTags(content: string, defaults: string[]): string[] {
  const rawTags = extractField(content, "TAGS");
  const tags = rawTags
    ? rawTags.split(",").map((tag) => tag.trim()).filter(Boolean)
    : [];
  return Array.from(new Set([...defaults, ...tags]));
}

function splitChunksWithLineRanges(text: string): Chunk[] {
  const lines = text.split(/\r?\n/);
  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let startLine = 1;

  const flush = (endLine: number) => {
    let leading = 0;
    let trailing = buffer.length - 1;

    while (leading <= trailing && !buffer[leading].trim()) {
      leading++;
    }
    while (trailing >= leading && !buffer[trailing].trim()) {
      trailing--;
    }

    if (leading <= trailing) {
      chunks.push({
        content: buffer.slice(leading, trailing + 1).join("\n"),
        startLine: startLine + leading,
        endLine: endLine - (buffer.length - 1 - trailing)
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "--------------------------------") {
      flush(i);
      buffer = [];
      startLine = i + 2;
    } else {
      buffer.push(lines[i]);
    }
  }

  flush(lines.length);
  return chunks;
}

function resolveOpenUxCommitSha(openUxRepoDir: string): string | null {
  const result = spawnSync("git", ["-C", openUxRepoDir, "rev-parse", "HEAD"], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return null;
  }
  const sha = result.stdout.trim();
  return /^[a-f0-9]{40}$/i.test(sha) ? sha : null;
}

function buildGithubLineUrl(commitSha: string, inputFile: string, chunk: Chunk): string {
  return `https://github.com/SAP/open-ux-tools/blob/${commitSha}/packages/fiori-docs-embeddings/data_local/${encodeURIComponent(inputFile)}#L${chunk.startLine}-L${chunk.endLine}`;
}

function renderMaterializedMarkdown(source: OpenUxGeneratedSource, inputFile: string, chunk: Chunk, index: number, commitSha: string): { fileName: string; markdown: string } {
  const title = extractTitle(chunk.content, `${inputFile} ${index + 1}`);
  const description = extractDescription(chunk.content, title);
  const tags = extractTags(chunk.content, source.defaultTags);
  const sourceUrl = buildGithubLineUrl(commitSha, inputFile, chunk);
  const hasH1 = /^#\s+/m.test(chunk.content);
  const baseName = slugify(inputFile.replace(/\.md$/i, ""));
  const fileName = `${String(index + 1).padStart(3, "0")}-${baseName}-${slugify(title).slice(0, 80)}.md`;

  const frontmatter = [
    "---",
    `title: ${yamlString(title)}`,
    `description: ${yamlString(description)}`,
    "keywords:",
    ...tags.map((tag) => `  - ${yamlString(tag)}`),
    "---",
    ""
  ].join("\n");

  const heading = hasH1 ? "" : `# ${title}\n\n`;
  const provenance = [
    `**URL:** ${sourceUrl}`,
    `**Open UX Source:** ${inputFile}`,
    `**Open UX Library:** ${source.libraryId}`,
    ""
  ].join("\n");

  return {
    fileName,
    markdown: `${frontmatter}${heading}${provenance}${chunk.content.trim()}\n`
  };
}

export async function materializeOpenUxGeneratedSources(options: MaterializeOptions = {}): Promise<{ filesWritten: number; chunksWritten: number }> {
  const dataLocalDir = options.dataLocalDir ?? OPENUX_DATA_LOCAL_DIR;
  const outputRoot = options.outputRoot ?? OPENUX_GENERATED_OUTPUT_ROOT;
  const openUxRepoDir = options.openUxRepoDir ?? path.join("sources", "open-ux-tools");
  const sources = options.sources ?? OPENUX_GENERATED_SOURCES;
  const commitSha = options.commitSha ?? resolveOpenUxCommitSha(openUxRepoDir);

  if (!commitSha) {
    console.warn(`⚠️  Could not resolve Open UX commit SHA from ${openUxRepoDir}; skipping generated source materialization.`);
    return { filesWritten: 0, chunksWritten: 0 };
  }

  try {
    await fs.access(dataLocalDir);
  } catch {
    console.warn(`⚠️  Open UX data_local directory not found at ${dataLocalDir}; skipping generated source materialization.`);
    return { filesWritten: 0, chunksWritten: 0 };
  }

  if (options.clean !== false) {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }

  let filesWritten = 0;
  let chunksWritten = 0;

  for (const source of sources) {
    const targetDir = path.join(outputRoot, source.outputDir);
    await fs.mkdir(targetDir, { recursive: true });

    for (const inputFile of source.inputFiles) {
      const inputPath = path.join(dataLocalDir, inputFile);
      const raw = await fs.readFile(inputPath, "utf8");
      const chunks = splitChunksWithLineRanges(raw);

      for (const [index, chunk] of chunks.entries()) {
        const materialized = renderMaterializedMarkdown(source, inputFile, chunk, index, commitSha);
        await fs.writeFile(path.join(targetDir, materialized.fileName), materialized.markdown, "utf8");
        filesWritten++;
        chunksWritten++;
      }
    }
  }

  console.log(`✅  Materialized ${chunksWritten} Open UX generated chunks into ${outputRoot}.`);
  return { filesWritten, chunksWritten };
}
