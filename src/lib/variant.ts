import fs from "node:fs";
import path from "node:path";

export interface VariantToolFlags {
  abapLint: boolean;
  abapFeatureMatrix: boolean;
}

export interface VariantServerIdentity {
  stdioName: string;
  stdioDescription: string;
  streamableName: string;
  streamableDescription: string;
  httpStatusPort: number;
  streamablePort: number;
  pm2HttpName: string;
  pm2StreamableName: string;
  deployPath: string;
}

export interface VariantConfig {
  metadataPath?: string;
  id: string;
  description: string;
  sourceAllowlist: string[];
  submodulePaths: string[];
  tools: VariantToolFlags;
  server: VariantServerIdentity;
}

const DEFAULT_VARIANT = "sap-docs";
const VARIANT_SELECTOR_FILE = ".mcp-variant";
const VARIANT_DIR = path.resolve(process.cwd(), "config", "variants");

let cachedVariantName: string | null = null;
let cachedVariantConfig: VariantConfig | null = null;

function resolveVariantName(): string {
  const envVariant = process.env.MCP_VARIANT?.trim();
  if (envVariant) {
    return envVariant;
  }

  try {
    const selectorPath = path.resolve(process.cwd(), VARIANT_SELECTOR_FILE);
    if (fs.existsSync(selectorPath)) {
      const fileVariant = fs.readFileSync(selectorPath, "utf8").trim();
      if (fileVariant) {
        return fileVariant;
      }
    }
  } catch {
    // Ignore read errors and use fallback.
  }

  return DEFAULT_VARIANT;
}

function readVariantConfig(variantName: string): VariantConfig {
  const variantPath = path.resolve(VARIANT_DIR, `${variantName}.json`);
  if (!fs.existsSync(variantPath)) {
    const supported = fs
      .readdirSync(VARIANT_DIR)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => entry.replace(/\.json$/, ""));

    throw new Error(
      `Unknown MCP variant \"${variantName}\". Supported variants: ${supported.join(", ")}`
    );
  }

  const parsed = JSON.parse(fs.readFileSync(variantPath, "utf8")) as VariantConfig;
  return parsed;
}

export function getVariantName(): string {
  if (!cachedVariantName) {
    cachedVariantName = resolveVariantName();
  }

  return cachedVariantName;
}

export function getVariantConfig(): VariantConfig {
  if (!cachedVariantConfig) {
    cachedVariantConfig = readVariantConfig(getVariantName());
  }

  return cachedVariantConfig;
}

export function isSourceAllowed(sourceId: string): boolean {
  const { sourceAllowlist } = getVariantConfig();
  return sourceAllowlist.includes(sourceId);
}

export function getAllowedSources(): string[] {
  return [...getVariantConfig().sourceAllowlist];
}

export function getAllowedSubmodulePaths(): string[] {
  return [...getVariantConfig().submodulePaths];
}

export function isToolEnabled(tool: keyof VariantToolFlags): boolean {
  return Boolean(getVariantConfig().tools[tool]);
}

export function clearVariantCache(): void {
  cachedVariantName = null;
  cachedVariantConfig = null;
}
