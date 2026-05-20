// UI5 Version Diff
// Fetch, cache, and filter the consolidated change data published by
// https://github.com/marianfoo/ui5-lib-diff (powering https://ui5-lib-diff.marianzeis.de/).
//
// The preferred static API is a one-file bundle:
//   { schemaVersion, generatedAt, datasets: { SAPUI5: [...], OpenUI5: [...] } }
// Each dataset is an array of version blocks:
//   [{ version, date, libraries: [{ library, changes: [{ type, text, commit_url?, id? }] }] }]
// Runtime access is local-only; setup/download scripts are responsible for
// refreshing the bundle before the server starts.

import { readFile } from "node:fs/promises";
import { TtlCache } from "../softwareHeroes/core.js";
import { CONFIG } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Ui5LibDiffLibrary = "SAPUI5" | "OpenUI5";

export type Ui5ChangeType = "FEATURE" | "FIX" | "DEPRECATED";

/** Raw change record as published by ui5-lib-diff. */
interface RawChange {
  type: string;
  text: string;
  commit_url?: string;
  id?: string;
}

/** Raw library block inside a version. */
interface RawLibraryBlock {
  library: string;
  changes: RawChange[];
}

/** Raw version block as published by ui5-lib-diff. */
interface RawVersionBlock {
  version: string;
  date?: string;
  libraries: RawLibraryBlock[];
}

/** One-file bundle published by ui5-lib-diff for local-first consumers. */
interface RawBundle {
  schemaVersion?: number;
  generatedAt?: string;
  datasets?: Partial<Record<Ui5LibDiffLibrary, RawVersionBlock[]>>;
}

/** A single filtered change emitted by the tool. */
export interface Ui5ChangeEntry {
  version: string;
  date?: string;
  library: string;
  type: Ui5ChangeType;
  text: string;
  commit_url?: string;
}

export interface Ui5VersionDiffOptions {
  library?: Ui5LibDiffLibrary;
  from_version: string;
  to_version: string;
  /** Filter to specific change types. Defaults to all three. */
  types?: Ui5ChangeType[];
  /** Substring filter on the UI5 library name (case-insensitive, e.g. "sap.m"). */
  ui5_library?: string;
  /** Substring filter on the change text (case-insensitive). */
  query?: string;
  /** Maximum entries to return. Default: 200, max: 1000. */
  limit?: number;
}

export interface Ui5VersionDiffResult {
  library: Ui5LibDiffLibrary;
  from_version: string;
  to_version: string;
  /** Versions that fall in the requested range (exclusive of from, inclusive of to). */
  versionsInRange: string[];
  counts: Record<Ui5ChangeType, number>;
  totalEntries: number;
  truncated: boolean;
  entries: Ui5ChangeEntry[];
  sourceUrl: string;
  meta: {
    availableVersions: number;
    minVersion?: string;
    maxVersion?: string;
    sourceDataPath?: string;
    cacheSource?: "disk";
    /** Soft signals for the caller: out-of-range hints, coercion notes, etc. */
    notes?: string[];
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BUNDLE_CACHE_KEY = "all-changes";
const UI5_LIBRARIES: Ui5LibDiffLibrary[] = ["SAPUI5", "OpenUI5"];
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface LoadedDataset {
  data: RawVersionBlock[];
  sourceDataPath: string;
  cacheSource: "disk";
}

interface LoadedBundle {
  datasets: Record<Ui5LibDiffLibrary, RawVersionBlock[]>;
  sourceDataPath: string;
  cacheSource: "disk";
  generatedAt?: string;
}

// 24h memory cache, shared across calls within a single process.
const memoryCache = new TtlCache<LoadedDataset>(
  CONFIG.UI5_LIB_DIFF_CACHE_TTL_MS
);
const bundleMemoryCache = new TtlCache<LoadedBundle>(
  CONFIG.UI5_LIB_DIFF_CACHE_TTL_MS
);

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function buildUi5LibDiffAppUrl(options: Ui5VersionDiffOptions): string {
  const params = new URLSearchParams({
    versionFrom: options.from_version,
    versionTo: options.to_version,
    ui5Type: options.library ?? "SAPUI5",
  });
  return `${normalizeBaseUrl(CONFIG.UI5_LIB_DIFF_APP_BASE_URL)}/?${params.toString()}`;
}

function localBundlePath(): string {
  return CONFIG.UI5_LIB_DIFF_BUNDLE_PATH;
}

// ---------------------------------------------------------------------------
// Version parsing & comparison
// ---------------------------------------------------------------------------

/** Parse "1.108.0" -> [1, 108, 0]. Missing parts default to 0. */
export function parseUi5Version(v: string): [number, number, number] {
  const trimmed = (v ?? "").trim().replace(/^v/i, "");
  const parts = trimmed.split(".").slice(0, 3);
  const nums = parts.map((p) => {
    const n = parseInt(p.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  });
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0];
}

/** Returns negative / 0 / positive like the usual comparator contract. */
export function compareUi5Versions(a: string, b: string): number {
  const aa = parseUi5Version(a);
  const bb = parseUi5Version(b);
  for (let i = 0; i < 3; i++) {
    if (aa[i] !== bb[i]) return aa[i] - bb[i];
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Type normalization
// ---------------------------------------------------------------------------

const CANONICAL_TYPES: ReadonlySet<Ui5ChangeType> = new Set([
  "FEATURE",
  "FIX",
  "DEPRECATED",
]);

/**
 * The upstream data is canonicalized at the source as of
 * https://github.com/marianfoo/ui5-lib-diff (lib/ui5DiffData.js#normalizeChangeType):
 * every `type` is one of "FEATURE" | "FIX" | "DEPRECATED" and the historic
 * casing variants ("Feature", "feature", "Fix") plus internal/legacy
 * markers ("INTERNAL", the "INETRNAL" typo, "[INTERNAL] ALP", "LEGACY")
 * are dropped before the consolidated JSON is written.
 *
 * We keep a defensive uppercase path so a stale data file (e.g. between
 * upstream merge and the next weekly refresh) doesn't break the tool.
 * Drift is surfaced via `reportNonCanonicalDrift` during load.
 */
export function normalizeChangeType(raw: string): Ui5ChangeType | null {
  if (typeof raw === "string" && CANONICAL_TYPES.has(raw as Ui5ChangeType)) {
    return raw as Ui5ChangeType;
  }
  const upper = (raw ?? "").trim().toUpperCase();
  if (CANONICAL_TYPES.has(upper as Ui5ChangeType)) {
    return upper as Ui5ChangeType;
  }
  return null;
}

/**
 * After loading a dataset, count any non-canonical `type` values and emit
 * a single grouped warning. Helps spot upstream regressions early without
 * spamming the log on every cache hit.
 */
function reportNonCanonicalDrift(
  library: Ui5LibDiffLibrary,
  data: RawVersionBlock[]
): void {
  const driftCounts = new Map<string, number>();
  for (const block of data) {
    for (const lib of block.libraries ?? []) {
      for (const change of lib.changes ?? []) {
        if (
          typeof change.type !== "string" ||
          !CANONICAL_TYPES.has(change.type as Ui5ChangeType)
        ) {
          const key =
            typeof change.type === "string" ? change.type : String(change.type);
          driftCounts.set(key, (driftCounts.get(key) ?? 0) + 1);
        }
      }
    }
  }
  if (driftCounts.size > 0) {
    console.warn(
      `[ui5VersionDiff] ${library} contains non-canonical types — expected upstream to canonicalize. Drift:`,
      Object.fromEntries(driftCounts)
    );
  }
}

// ---------------------------------------------------------------------------
// Data loading (memory -> local all-changes bundle)
// ---------------------------------------------------------------------------

function parseBundleJson(
  json: unknown,
  sourceDataPath: string
): LoadedBundle {
  const raw = json as RawBundle | undefined;
  const sapui5 = raw?.datasets?.SAPUI5;
  const openui5 = raw?.datasets?.OpenUI5;

  if (!Array.isArray(sapui5) || !Array.isArray(openui5)) {
    throw new Error(
      "Expected JSON object with datasets.SAPUI5 and datasets.OpenUI5 arrays"
    );
  }

  return {
    datasets: {
      SAPUI5: sapui5,
      OpenUI5: openui5,
    },
    sourceDataPath,
    cacheSource: "disk",
    generatedAt:
      typeof raw?.generatedAt === "string" ? raw.generatedAt : undefined,
  };
}

function cacheLoadedBundle(bundle: LoadedBundle, reportDrift = true): void {
  bundleMemoryCache.set(BUNDLE_CACHE_KEY, bundle);
  for (const library of UI5_LIBRARIES) {
    const data = bundle.datasets[library];
    memoryCache.set(library, {
      data,
      sourceDataPath: bundle.sourceDataPath,
      cacheSource: bundle.cacheSource,
    });
    if (reportDrift) {
      reportNonCanonicalDrift(library, data);
    }
  }
}

async function readLocalBundle(): Promise<LoadedBundle> {
  const path = localBundlePath();
  const raw = await readFile(path, "utf-8");
  return parseBundleJson(JSON.parse(raw), path);
}

async function loadConsolidated(
  library: Ui5LibDiffLibrary
): Promise<LoadedDataset> {
  const cached = memoryCache.get(library);
  if (cached) return cached;

  const cachedBundle = bundleMemoryCache.get(BUNDLE_CACHE_KEY);
  if (cachedBundle) {
    cacheLoadedBundle(cachedBundle, false);
    const hydrated = memoryCache.get(library);
    if (hydrated) return hydrated;
  }

  try {
    const bundle = await readLocalBundle();
    cacheLoadedBundle(bundle);
    const loadedFromBundle = memoryCache.get(library);
    if (loadedFromBundle) return loadedFromBundle;
  } catch (err) {
    throw new Error(
      `ui5-lib-diff local bundle unavailable at ${localBundlePath()}. Run npm run download:ui5-lib-diff or point UI5_LIB_DIFF_BUNDLE_PATH to a local all-changes.json file. Details: ${
        err instanceof Error ? err.message : String(err)
      })`
    );
  }

  throw new Error(
    `ui5-lib-diff local bundle at ${localBundlePath()} did not contain ${library}`
  );
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/**
 * Apply the diff filters to an already-loaded dataset.
 * Pure function so unit tests can drive it from fixtures.
 */
export function filterUi5Diff(
  data: RawVersionBlock[],
  options: Ui5VersionDiffOptions
): Ui5VersionDiffResult {
  const library = options.library ?? "SAPUI5";
  const notes: string[] = [];

  // Defensive coercion: an MCP client that doesn't validate against the
  // input schema could send `types: "FEATURE"` (string). Without this
  // guard, `new Set("FEATURE")` would yield Set{"F","E","A","T","U","R"}
  // and silently match nothing.
  const requestedTypes = Array.isArray(options.types)
    ? options.types.filter((t): t is Ui5ChangeType =>
        typeof t === "string" && CANONICAL_TYPES.has(t as Ui5ChangeType)
      )
    : [];
  const typesAllowed = new Set<Ui5ChangeType>(
    requestedTypes.length > 0
      ? requestedTypes
      : ["FEATURE", "FIX", "DEPRECATED"]
  );

  const limit = Math.min(
    Math.max(Math.floor(options.limit ?? DEFAULT_LIMIT), 1),
    MAX_LIMIT
  );
  const libFilter = options.ui5_library?.toLowerCase().trim() || "";
  const queryFilter = options.query?.toLowerCase().trim() || "";

  const fromCmp = options.from_version;
  const toCmp = options.to_version;

  const counts: Record<Ui5ChangeType, number> = {
    FEATURE: 0,
    FIX: 0,
    DEPRECATED: 0,
  };
  const entries: Ui5ChangeEntry[] = [];
  const versionsInRange: string[] = [];

  // Track dataset bounds for meta.
  let minVersion: string | undefined;
  let maxVersion: string | undefined;

  for (const block of data) {
    const version = block.version;
    if (!version) continue;

    if (!minVersion || compareUi5Versions(version, minVersion) < 0) {
      minVersion = version;
    }
    if (!maxVersion || compareUi5Versions(version, maxVersion) > 0) {
      maxVersion = version;
    }

    // Range: changes that landed AFTER from_version, up to and including to_version.
    if (compareUi5Versions(version, fromCmp) <= 0) continue;
    if (compareUi5Versions(version, toCmp) > 0) continue;

    versionsInRange.push(version);

    for (const libBlock of block.libraries ?? []) {
      const libName = libBlock.library ?? "";
      if (libFilter && !libName.toLowerCase().includes(libFilter)) continue;

      for (const change of libBlock.changes ?? []) {
        const type = normalizeChangeType(change.type);
        if (!type || !typesAllowed.has(type)) continue;
        const text = (change.text ?? "").trim();
        if (queryFilter && !text.toLowerCase().includes(queryFilter)) continue;

        counts[type]++;

        if (entries.length < limit) {
          entries.push({
            version,
            date: block.date,
            library: libName,
            type,
            text,
            commit_url: change.commit_url,
          });
        }
      }
    }
  }

  // Sort version list newest-first for display.
  versionsInRange.sort((a, b) => compareUi5Versions(b, a));

  // Surface out-of-range hints so the caller (LLM or human) knows when the
  // requested range falls outside what the dataset actually carries.
  if (minVersion && compareUi5Versions(options.from_version, minVersion) < 0) {
    notes.push(
      `from_version ${options.from_version} predates the oldest version in the dataset (${minVersion}); the lower bound is effectively that version.`
    );
  }
  if (maxVersion && compareUi5Versions(options.to_version, maxVersion) > 0) {
    notes.push(
      `to_version ${options.to_version} is newer than the newest version in the dataset (${maxVersion}); upgrade to a future release isn't covered yet.`
    );
  }
  if (versionsInRange.length === 0) {
    notes.push(
      `No versions matched the range (${options.from_version}, ${options.to_version}]. Tip: use the full x.y.z form — "1.120" matches "1.120.0" exactly and will miss "1.120.5".`
    );
  }
  if (Array.isArray(options.types) && requestedTypes.length === 0 && options.types.length > 0) {
    notes.push(
      `types parameter contained no valid values (expected subset of FEATURE / FIX / DEPRECATED); falling back to all three.`
    );
  }

  const totalEntries = counts.FEATURE + counts.FIX + counts.DEPRECATED;

  return {
    library,
    from_version: options.from_version,
    to_version: options.to_version,
    versionsInRange,
    counts,
    totalEntries,
    truncated: totalEntries > entries.length,
    entries,
    sourceUrl: "https://ui5-lib-diff.marianzeis.de/",
    meta: {
      availableVersions: data.length,
      minVersion,
      maxVersion,
      ...(notes.length > 0 ? { notes } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getUi5VersionDiff(
  options: Ui5VersionDiffOptions
): Promise<Ui5VersionDiffResult> {
  if (!options.from_version || !options.to_version) {
    throw new Error("ui5_version_diff requires from_version and to_version");
  }
  // Strict <: from == to is a degenerate range that, given the
  // exclusive-from / inclusive-to semantics, would silently return zero
  // entries. Surface that as an error so the caller can fix the inputs.
  if (compareUi5Versions(options.from_version, options.to_version) >= 0) {
    throw new Error(
      `from_version (${options.from_version}) must be strictly less than to_version (${options.to_version}). The range is exclusive at from_version and inclusive at to_version, so from == to has no changes by definition.`
    );
  }

  const library = options.library ?? "SAPUI5";
  const loaded = await loadConsolidated(library);
  const result = filterUi5Diff(loaded.data, { ...options, library });
  return {
    ...result,
    sourceUrl: buildUi5LibDiffAppUrl({ ...options, library }),
    meta: {
      ...result.meta,
      sourceDataPath: loaded.sourceDataPath,
      cacheSource: loaded.cacheSource,
    },
  };
}

// ---------------------------------------------------------------------------
// Startup local bundle warmup (never throws)
// ---------------------------------------------------------------------------

export async function prefetchUi5LibDiff(): Promise<void> {
  try {
    const bundle = await readLocalBundle();
    cacheLoadedBundle(bundle);
    console.log(
      `✅ [ui5VersionDiff] Loaded local UI5 diff bundle from ${bundle.sourceDataPath} (${bundle.datasets.SAPUI5.length} SAPUI5 versions, ${bundle.datasets.OpenUI5.length} OpenUI5 versions)`
    );
  } catch (err) {
    console.error(
      `⚠️ [ui5VersionDiff] Local UI5 diff bundle unavailable at ${localBundlePath()}. Run npm run download:ui5-lib-diff before using ui5_version_diff:`,
      err
    );
  }
}

export function getUi5LibDiffCacheStats() {
  return {
    bundle: bundleMemoryCache.has(BUNDLE_CACHE_KEY),
    SAPUI5: memoryCache.has("SAPUI5"),
    OpenUI5: memoryCache.has("OpenUI5"),
    bundlePath: localBundlePath(),
    ttlMs: CONFIG.UI5_LIB_DIFF_CACHE_TTL_MS,
  };
}

export function clearUi5LibDiffCachesForTests(): void {
  memoryCache.clear();
  bundleMemoryCache.clear();
}
