// UI5 Version Diff
// Fetch, cache, and filter the consolidated change data published by
// https://github.com/marianfoo/ui5-lib-diff (powering https://ui5-lib-diff.marianzeis.de/).
//
// Each consolidated JSON is an array of version blocks:
//   [{ version, date, libraries: [{ library, changes: [{ type, text, commit_url?, id? }] }] }]
// The data covers both SAPUI5 and OpenUI5; we expose a single tool with a
// `library` selector so callers can pick the flavour matching their project.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
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
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SOURCE_BASE_URL =
  "https://raw.githubusercontent.com/marianfoo/ui5-lib-diff/main/de.marianzeis.ui5libdiff/webapp/data";

const FILE_NAMES: Record<Ui5LibDiffLibrary, string> = {
  SAPUI5: "consolidatedSAPUI5.json",
  OpenUI5: "consolidatedOpenUI5.json",
};

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

// 24h memory cache, shared across calls within a single process.
const memoryCache = new TtlCache<RawVersionBlock[]>(
  CONFIG.UI5_LIB_DIFF_CACHE_TTL_MS
);

function diskCachePath(library: Ui5LibDiffLibrary): string {
  return CONFIG.UI5_LIB_DIFF_CACHE_DIR + `/${FILE_NAMES[library]}`;
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
 * https://github.com/marianfoo/ui5-lib-diff (parseChanges.js#normalizeType):
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
// Data loading (memory -> network -> disk fallback)
// ---------------------------------------------------------------------------

async function writeDiskCache(
  library: Ui5LibDiffLibrary,
  data: RawVersionBlock[]
): Promise<void> {
  const path = diskCachePath(library);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data), "utf-8");
}

async function readDiskCache(
  library: Ui5LibDiffLibrary
): Promise<RawVersionBlock[] | undefined> {
  try {
    const raw = await readFile(diskCachePath(library), "utf-8");
    return JSON.parse(raw) as RawVersionBlock[];
  } catch {
    return undefined;
  }
}

async function fetchConsolidated(
  library: Ui5LibDiffLibrary
): Promise<RawVersionBlock[]> {
  const url = `${SOURCE_BASE_URL}/${FILE_NAMES[library]}`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CONFIG.UI5_LIB_DIFF_TIMEOUT_MS
  );
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    const json = (await response.json()) as RawVersionBlock[];
    if (!Array.isArray(json)) {
      throw new Error(`Expected JSON array from ${url}`);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadConsolidated(
  library: Ui5LibDiffLibrary
): Promise<RawVersionBlock[]> {
  const cached = memoryCache.get(library);
  if (cached) return cached;

  try {
    const fresh = await fetchConsolidated(library);
    memoryCache.set(library, fresh);
    reportNonCanonicalDrift(library, fresh);
    writeDiskCache(library, fresh).catch((err) =>
      console.error(
        `⚠️ [ui5VersionDiff] Failed to persist ${library} disk cache:`,
        err
      )
    );
    return fresh;
  } catch (networkErr) {
    console.error(
      `⚠️ [ui5VersionDiff] Network fetch failed for ${library}, trying disk cache:`,
      networkErr
    );
    const disk = await readDiskCache(library);
    if (disk) {
      memoryCache.set(library, disk);
      reportNonCanonicalDrift(library, disk);
      return disk;
    }
    throw new Error(
      `ui5-lib-diff data unavailable for ${library}: network failed and no disk cache exists (${
        networkErr instanceof Error ? networkErr.message : String(networkErr)
      })`
    );
  }
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
  const typesAllowed = new Set<Ui5ChangeType>(
    options.types && options.types.length > 0
      ? options.types
      : ["FEATURE", "FIX", "DEPRECATED"]
  );
  const limit = Math.min(
    Math.max(options.limit ?? DEFAULT_LIMIT, 1),
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
  if (compareUi5Versions(options.from_version, options.to_version) > 0) {
    throw new Error(
      `from_version (${options.from_version}) must be <= to_version (${options.to_version})`
    );
  }

  const library = options.library ?? "SAPUI5";
  const data = await loadConsolidated(library);
  return filterUi5Diff(data, { ...options, library });
}

// ---------------------------------------------------------------------------
// Startup prefetch (fire-and-forget, never throws)
// ---------------------------------------------------------------------------

export async function prefetchUi5LibDiff(): Promise<void> {
  await Promise.all(
    (Object.keys(FILE_NAMES) as Ui5LibDiffLibrary[]).map(async (library) => {
      try {
        const data = await fetchConsolidated(library);
        memoryCache.set(library, data);
        reportNonCanonicalDrift(library, data);
        await writeDiskCache(library, data);
        console.log(
          `✅ [ui5VersionDiff] Prefetched ${library}: ${data.length} versions`
        );
      } catch (err) {
        console.error(
          `⚠️ [ui5VersionDiff] Prefetch failed for ${library}:`,
          err
        );
        const disk = await readDiskCache(library);
        if (disk) {
          memoryCache.set(library, disk);
          reportNonCanonicalDrift(library, disk);
          console.log(
            `📂 [ui5VersionDiff] Loaded ${library} from disk cache: ${disk.length} versions`
          );
        }
      }
    })
  );
}

export function getUi5LibDiffCacheStats() {
  return {
    SAPUI5: memoryCache.has("SAPUI5"),
    OpenUI5: memoryCache.has("OpenUI5"),
    ttlMs: CONFIG.UI5_LIB_DIFF_CACHE_TTL_MS,
  };
}
