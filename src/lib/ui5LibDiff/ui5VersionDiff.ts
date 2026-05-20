// UI5 Version Diff
// Fetch, cache, and filter the consolidated change data published by
// https://github.com/marianfoo/ui5-lib-diff (powering https://ui5-lib-diff.marianzeis.de/).
//
// The preferred static API is a one-file bundle:
//   { schemaVersion, generatedAt, datasets: { SAPUI5: [...], OpenUI5: [...] }, whatsNew: [...] }
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

type NullableString = string | null;

/** Raw change record as published by ui5-lib-diff. */
interface RawChange {
  type?: NullableString;
  text?: NullableString;
  commit_url?: NullableString;
  id?: number | string | null;
}

/** Raw library block inside a version. */
interface RawLibraryBlock {
  library?: NullableString;
  changes?: RawChange[] | null;
}

/** Raw version block as published by ui5-lib-diff. */
interface RawVersionBlock {
  version?: NullableString;
  date?: NullableString;
  libraries?: RawLibraryBlock[] | null;
}

/** One-file bundle published by ui5-lib-diff for local-first consumers. */
interface RawBundle {
  schemaVersion?: number;
  generatedAt?: NullableString;
  datasets?: Partial<Record<Ui5LibDiffLibrary, RawVersionBlock[]>>;
  whatsNew?: RawWhatsNewEntry[] | null;
}

interface RawWhatsNewEntry {
  id?: number | string | null;
  Version?: NullableString;
  Title?: NullableString;
  Description?: NullableString;
  Type?: NullableString;
  Action?: NullableString;
  Category?: NullableString;
  Valid_as_Of?: NullableString;
  outputloio?: NullableString;
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
  /** Exact version to inspect. If provided, range semantics do not apply. */
  version?: string;
  from_version?: string;
  to_version?: string;
  /** Filter to specific change types. Defaults to all three. */
  types?: Ui5ChangeType[];
  /** Substring filter on the UI5 library name (case-insensitive, e.g. "sap.m"). */
  ui5_library?: string;
  /** Substring filter on the change text (case-insensitive). */
  query?: string;
}

export interface Ui5WhatsNewEntry {
  version: string;
  title: string;
  description: string;
  type?: string;
  action?: string;
  category?: string;
  validAsOf?: string;
  url?: string;
  id?: number | string;
}

export interface Ui5VersionDiffResult {
  mode: "range" | "version";
  library: Ui5LibDiffLibrary;
  from_version: string;
  to_version: string;
  version?: string;
  /** Versions that fall in the requested range (exclusive of from, inclusive of to). */
  versionsInRange: string[];
  counts: Record<Ui5ChangeType, number>;
  totalEntries: number;
  entries: Ui5ChangeEntry[];
  whatsNewEntries: Ui5WhatsNewEntry[];
  whatsNewTotalEntries: number;
  sourceUrl: string;
  meta: {
    availableVersions: number;
    minVersion?: string;
    maxVersion?: string;
    generatedAt?: string;
    sourceDataPath?: string;
    cacheSource?: "disk";
    requested?: {
      version?: string;
      from_version?: string;
      to_version?: string;
    };
    resolved?: {
      version?: string;
      from_version?: string;
      to_version?: string;
    };
    whatsNewAvailable?: number;
    /** Soft signals for the caller: out-of-range hints, coercion notes, etc. */
    notes?: string[];
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BUNDLE_CACHE_KEY = "all-changes";
const UI5_LIBRARIES: Ui5LibDiffLibrary[] = ["SAPUI5", "OpenUI5"];

interface LoadedDataset {
  data: RawVersionBlock[];
  whatsNew: RawWhatsNewEntry[];
  sourceDataPath: string;
  cacheSource: "disk";
  generatedAt?: string;
}

interface LoadedBundle {
  datasets: Record<Ui5LibDiffLibrary, RawVersionBlock[]>;
  whatsNew: RawWhatsNewEntry[];
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
  const from = options.from_version ?? options.version ?? "";
  const to = options.to_version ?? options.version ?? "";
  const params = new URLSearchParams({
    versionFrom: from,
    versionTo: to,
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

function ui5MinorKey(version: string): string {
  return version
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .slice(0, 2)
    .join(".");
}

function normalizeWhatsNewVersion(version: string): string {
  const [major, minor] = parseUi5Version(version);
  return `${major}.${minor}`;
}

function stripHtml(value = ""): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep optional string fields out of MCP structured output when absent or null. */
export function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
export function normalizeChangeType(raw: unknown): Ui5ChangeType | null {
  if (typeof raw === "string" && CANONICAL_TYPES.has(raw as Ui5ChangeType)) {
    return raw as Ui5ChangeType;
  }
  if (typeof raw !== "string") {
    return null;
  }
  const upper = raw.trim().toUpperCase();
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
    whatsNew: Array.isArray(raw?.whatsNew) ? raw.whatsNew : [],
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
      whatsNew: bundle.whatsNew,
      sourceDataPath: bundle.sourceDataPath,
      cacheSource: bundle.cacheSource,
      generatedAt: bundle.generatedAt,
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
      `ui5-lib-diff local bundle unavailable at ${localBundlePath()}. Refresh the bundle during setup with npm run download:ui5-lib-diff or point UI5_LIB_DIFF_BUNDLE_PATH to a local all-changes.json file. Details: ${
        err instanceof Error ? err.message : String(err)
      })`
    );
  }

  throw new Error(
    `ui5-lib-diff local bundle at ${localBundlePath()} did not contain ${library}`
  );
}

function requestedVersionCandidates(options: Ui5VersionDiffOptions): string[] {
  return [options.version, options.from_version, options.to_version].filter(
    (version): version is string => Boolean(version)
  );
}

function shouldReloadLocalBundle(
  data: RawVersionBlock[],
  options: Ui5VersionDiffOptions
): boolean {
  const availableVersions = new Set(
    data.map((block) => block.version).filter(Boolean)
  );
  return requestedVersionCandidates(options).some(
    (version) => !availableVersions.has(version)
  );
}

async function reloadConsolidatedFromDisk(
  library: Ui5LibDiffLibrary
): Promise<LoadedDataset | null> {
  try {
    const bundle = await readLocalBundle();
    cacheLoadedBundle(bundle);
    return memoryCache.get(library) ?? null;
  } catch (err) {
    console.warn(
      `[ui5VersionDiff] Could not refresh local UI5 diff bundle from ${localBundlePath()}; using cached data:`,
      err
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function resolveAvailableVersion(
  availableVersions: string[],
  requested: string,
  label: "version" | "from_version" | "to_version",
  notes: string[]
): string {
  if (availableVersions.includes(requested)) {
    return requested;
  }

  const requestedMinor = ui5MinorKey(requested);
  const nearest = availableVersions
    .filter((version) => ui5MinorKey(version) === requestedMinor)
    .sort((a, b) => compareUi5Versions(b, a))
    .find((version) => compareUi5Versions(version, requested) <= 0);

  if (nearest) {
    notes.push(
      `${label} ${requested} is not available in the local bundle; using nearest available ${requestedMinor}.x version ${nearest}. If you expected a newer release, refresh the bundle during setup.`
    );
    return nearest;
  }

  notes.push(
    `${label} ${requested} is not available in the local bundle and no ${requestedMinor}.x version exists. The runtime is local-only and will not fetch newer data; refresh the bundle during setup.`
  );
  return requested;
}

function whatsNewUrl(item: RawWhatsNewEntry): string | undefined {
  return item.outputloio
    ? `https://help.sap.com/whats-new/67f60363b57f4ac0b23efd17fa192d60?locale=en-US&Component=${item.outputloio}`
    : undefined;
}

function filterWhatsNew(
  whatsNew: RawWhatsNewEntry[],
  options: Ui5VersionDiffOptions,
  mode: "range" | "version",
  fromVersion: string,
  toVersion: string
): {
  entries: Ui5WhatsNewEntry[];
  totalEntries: number;
} {
  const queryFilter = options.query?.toLowerCase().trim() || "";
  const allowedMinorKeys = new Set<string>();

  if (mode === "version") {
    allowedMinorKeys.add(normalizeWhatsNewVersion(toVersion));
  }

  const matching = whatsNew.filter((item) => {
    if (!item.Version) return false;
    const itemVersion = `${item.Version}.0`;
    const inRange =
      mode === "version"
        ? allowedMinorKeys.has(normalizeWhatsNewVersion(itemVersion))
        : compareUi5Versions(itemVersion, fromVersion) > 0 &&
          compareUi5Versions(itemVersion, toVersion) <= 0;
    if (!inRange) return false;

    if (queryFilter) {
      const searchable = [
        item.Title,
        item.Description,
        item.Type,
        item.Action,
        item.Category,
      ]
        .map((value) => stripHtml(value ?? ""))
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(queryFilter)) return false;
    }

    return true;
  });

  const entries = matching.map((item) => {
    const entry: Ui5WhatsNewEntry = {
      version: item.Version ?? "",
      title: stripHtml(item.Title ?? ""),
      description: stripHtml(item.Description ?? ""),
    };

    const type = optionalString(item.Type);
    if (type) entry.type = type;
    const action = optionalString(item.Action);
    if (action) entry.action = action;
    const category = optionalString(item.Category);
    if (category) entry.category = category;
    const validAsOf = optionalString(item.Valid_as_Of);
    if (validAsOf) entry.validAsOf = validAsOf;
    const url = whatsNewUrl(item);
    if (url) entry.url = url;
    if (item.id !== undefined && item.id !== null) {
      entry.id = item.id;
    }

    return entry;
  });

  return {
    entries,
    totalEntries: matching.length,
  };
}

/**
 * Apply the diff filters to an already-loaded dataset.
 * Pure function so unit tests can drive it from fixtures.
 */
export function filterUi5Diff(
  data: RawVersionBlock[],
  options: Ui5VersionDiffOptions,
  whatsNew: RawWhatsNewEntry[] = []
): Ui5VersionDiffResult {
  const library = options.library ?? "SAPUI5";
  const notes: string[] = [];
  const requestedVersion =
    options.version ??
    (!options.to_version && options.from_version ? options.from_version : undefined) ??
    (!options.from_version && options.to_version ? options.to_version : undefined);
  const mode: "range" | "version" =
    requestedVersion ||
    (options.from_version &&
      options.to_version &&
      compareUi5Versions(options.from_version, options.to_version) === 0)
      ? "version"
      : "range";

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

  const libFilter = options.ui5_library?.toLowerCase().trim() || "";
  const queryFilter = options.query?.toLowerCase().trim() || "";
  const availableVersions = data
    .map((block) => block.version)
    .filter((version): version is string => Boolean(version));
  const resolvedVersion =
    mode === "version"
      ? resolveAvailableVersion(
          availableVersions,
          requestedVersion ?? options.from_version ?? options.to_version ?? "",
          "version",
          notes
        )
      : undefined;
  const fromCmp =
    mode === "range"
      ? resolveAvailableVersion(
          availableVersions,
          options.from_version ?? "",
          "from_version",
          notes
        )
      : resolvedVersion ?? "";
  const toCmp =
    mode === "range"
      ? resolveAvailableVersion(
          availableVersions,
          options.to_version ?? "",
          "to_version",
          notes
        )
      : resolvedVersion ?? "";

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

    const inScope =
      mode === "version"
        ? compareUi5Versions(version, toCmp) === 0
        : compareUi5Versions(version, fromCmp) > 0 &&
          compareUi5Versions(version, toCmp) <= 0;
    if (!inScope) continue;

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

        const entry: Ui5ChangeEntry = {
          version,
          library: libName,
          type,
          text,
        };
        const date = optionalString(block.date);
        if (date) entry.date = date;
        const commitUrl = optionalString(change.commit_url);
        if (commitUrl) entry.commit_url = commitUrl;
        entries.push(entry);
      }
    }
  }

  // Sort version list newest-first for display.
  versionsInRange.sort((a, b) => compareUi5Versions(b, a));

  // Surface out-of-range hints so the caller (LLM or human) knows when the
  // requested range falls outside what the dataset actually carries.
  if (mode === "range" && minVersion && compareUi5Versions(fromCmp, minVersion) < 0) {
    notes.push(
      `from_version ${fromCmp} predates the oldest version in the dataset (${minVersion}); the lower bound is effectively that version.`
    );
  }
  if (maxVersion && compareUi5Versions(toCmp, maxVersion) > 0) {
    notes.push(
      `${mode === "version" ? "version" : "to_version"} ${toCmp} is newer than the newest version in the local bundle (${maxVersion}). The runtime is local-only and will not fetch newer data; refresh the bundle during setup.`
    );
  }
  if (versionsInRange.length === 0) {
    if (mode === "version") {
      notes.push(`No exact version block matched ${toCmp}.`);
    } else {
      notes.push(
        `No versions matched the range (${fromCmp}, ${toCmp}]. Tip: unavailable patch versions are resolved to the nearest lower available version with the same major.minor, matching the web app.`
      );
    }
  }
  if (Array.isArray(options.types) && requestedTypes.length === 0 && options.types.length > 0) {
    notes.push(
      `types parameter contained no valid values (expected subset of FEATURE / FIX / DEPRECATED); falling back to all three.`
    );
  }

  const totalEntries = counts.FEATURE + counts.FIX + counts.DEPRECATED;
  const whatsNewResult = filterWhatsNew(
    whatsNew,
    options,
    mode,
    fromCmp,
    toCmp
  );

  return {
    mode,
    library,
    from_version: fromCmp,
    to_version: toCmp,
    ...(mode === "version" ? { version: toCmp } : {}),
    versionsInRange,
    counts,
    totalEntries,
    entries,
    whatsNewEntries: whatsNewResult.entries,
    whatsNewTotalEntries: whatsNewResult.totalEntries,
    sourceUrl: "https://ui5-lib-diff.marianzeis.de/",
    meta: {
      availableVersions: data.length,
      minVersion,
      maxVersion,
      whatsNewAvailable: whatsNew.length,
      requested: {
        ...(requestedVersion ? { version: requestedVersion } : {}),
        ...(options.from_version ? { from_version: options.from_version } : {}),
        ...(options.to_version ? { to_version: options.to_version } : {}),
      },
      resolved: {
        ...(mode === "version"
          ? { version: toCmp }
          : { from_version: fromCmp, to_version: toCmp }),
      },
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
  const requestedSingleVersion =
    options.version ??
    (!options.to_version && options.from_version ? options.from_version : undefined) ??
    (!options.from_version && options.to_version ? options.to_version : undefined);

  if (!requestedSingleVersion && (!options.from_version || !options.to_version)) {
    throw new Error(
      "ui5_version_diff requires either version, or from_version and to_version"
    );
  }
  if (
    !requestedSingleVersion &&
    options.from_version &&
    options.to_version &&
    compareUi5Versions(options.from_version, options.to_version) > 0
  ) {
    throw new Error(
      `from_version (${options.from_version}) must be less than or equal to to_version (${options.to_version}). Use version="${options.from_version}" to inspect a single release.`
    );
  }

  const library = options.library ?? "SAPUI5";
  let loaded = await loadConsolidated(library);
  if (shouldReloadLocalBundle(loaded.data, options)) {
    loaded = (await reloadConsolidatedFromDisk(library)) ?? loaded;
  }
  const result = filterUi5Diff(loaded.data, { ...options, library }, loaded.whatsNew);
  return {
    ...result,
    sourceUrl: buildUi5LibDiffAppUrl({
      library,
      from_version: result.from_version,
      to_version: result.to_version,
    }),
    meta: {
      ...result.meta,
      sourceDataPath: loaded.sourceDataPath,
      cacheSource: loaded.cacheSource,
      generatedAt: loaded.generatedAt,
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
      `✅ [ui5VersionDiff] Loaded local UI5 diff bundle from ${bundle.sourceDataPath} (${bundle.datasets.SAPUI5.length} SAPUI5 versions, ${bundle.datasets.OpenUI5.length} OpenUI5 versions, ${bundle.whatsNew.length} What's New entries)`
    );
  } catch (err) {
    console.error(
      `⚠️ [ui5VersionDiff] Local UI5 diff bundle unavailable at ${localBundlePath()}. Refresh it during setup with npm run download:ui5-lib-diff before using ui5_version_diff:`,
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
