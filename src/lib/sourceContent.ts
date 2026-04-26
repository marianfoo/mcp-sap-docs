import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getSourcePath } from "./metadata.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let projectRoot: string | null = null;

export function getProjectRoot(): string {
  if (projectRoot) {
    return projectRoot;
  }

  let current = __dirname;
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "package.json"))) {
      projectRoot = current;
      return projectRoot;
    }
    current = path.dirname(current);
  }

  projectRoot = path.resolve(__dirname, "../../..");
  return projectRoot;
}

export function readSourceContentSync(libraryId: string, relFile: string): string | null {
  if (!relFile) {
    return null;
  }

  const sourcePath = getSourcePath(libraryId);
  if (!sourcePath) {
    return null;
  }

  const absPath = path.join(getProjectRoot(), "sources", sourcePath, relFile);
  try {
    return fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

export function extractSourceUrlFromText(text: string): string | null {
  const match = text.match(/\*\*URL:?\*\*:?\s*(https?:\/\/[^\s)]+)/i);
  if (match) {
    return normalizeExtractedUrl(match[1]);
  }

  const plainMatch = text.match(/\bURL:\s*(https?:\/\/[^\s)]+)/i);
  return plainMatch ? normalizeExtractedUrl(plainMatch[1]) : null;
}

function normalizeExtractedUrl(url: string): string {
  return url.replace(/[>,.;]+$/, "");
}
