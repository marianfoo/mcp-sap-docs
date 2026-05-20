#!/usr/bin/env node

import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const sourceUrl =
  process.env.UI5_LIB_DIFF_DOWNLOAD_URL ||
  "https://ui5-lib-diff.marianzeis.de/api/v1/all-changes.json";
const targetPath =
  process.env.UI5_LIB_DIFF_BUNDLE_PATH ||
  "dist/data/ui5-lib-diff/all-changes.json";
const timeoutMs = Number.parseInt(
  process.env.UI5_LIB_DIFF_DOWNLOAD_TIMEOUT_MS || "60000",
  10
);

function validateBundle(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Expected a JSON object");
  }
  const datasets = value.datasets;
  if (!datasets || typeof datasets !== "object") {
    throw new Error("Expected datasets object");
  }
  if (!Array.isArray(datasets.SAPUI5) || !Array.isArray(datasets.OpenUI5)) {
    throw new Error("Expected datasets.SAPUI5 and datasets.OpenUI5 arrays");
  }
  if ("whatsNew" in value && !Array.isArray(value.whatsNew)) {
    throw new Error("Expected optional whatsNew field to be an array");
  }
}

console.log(`Downloading UI5 lib diff bundle from ${sourceUrl}`);

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);
let response;
try {
  response = await fetch(sourceUrl, { signal: controller.signal });
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") {
    throw new Error(
      `Timed out after ${timeoutMs}ms while downloading UI5 lib diff bundle from ${sourceUrl}`
    );
  }
  throw error;
} finally {
  clearTimeout(timeout);
}

if (!response.ok) {
  throw new Error(`Failed to download UI5 lib diff bundle: HTTP ${response.status}`);
}

const text = await response.text();
const parsed = JSON.parse(text);
validateBundle(parsed);

await mkdir(dirname(targetPath), { recursive: true });
const tempPath = `${targetPath}.tmp`;
await writeFile(tempPath, `${JSON.stringify(parsed)}\n`, "utf8");
await rename(tempPath, targetPath);

console.log(
  `Wrote ${targetPath} (${parsed.datasets.SAPUI5.length} SAPUI5 versions, ${parsed.datasets.OpenUI5.length} OpenUI5 versions, ${(parsed.whatsNew || []).length} What's New entries)`
);
