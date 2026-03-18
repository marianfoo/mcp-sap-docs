import { readFile, readdir } from "fs/promises";
import { readdirSync } from "fs";
import { join } from "path";
import { TtlCache } from "../softwareHeroes/core.js";
import {
  SOURCES_DIR,
  SOURCE_FILES,
  CLASSIC_API_FILE,
  STATE_TO_LEVEL,
  CLEAN_CORE_LEVEL_LABELS,
  CUMULATIVE_LEVELS,
  CACHE_TTL_MS,
} from "./constants.js";
import type {
  RawObjectEntry,
  RawReleaseFile,
  SAPObject,
  DataStore,
  SystemType,
  CleanCoreLevel,
  ReleasedObjectsContext,
} from "./types.js";

// ---------------------------------------------------------------------------
// In-memory caches
// ---------------------------------------------------------------------------

const storeCache = new TtlCache<DataStore>(CACHE_TTL_MS);
let pceVersionsCache: string[] | undefined;
let releasedObjectsContext: ReleasedObjectsContext | undefined;

// ---------------------------------------------------------------------------
// Raw JSON loading
// ---------------------------------------------------------------------------

function normalizeEntry(entry: RawObjectEntry, source: "released" | "classicApi"): SAPObject | null {
  const objectType = (entry.tadirObject ?? entry.objectType ?? "").trim();
  const objectName = (entry.tadirObjName ?? entry.objectKey ?? "").trim();
  if (!objectType || !objectName) return null;

  const level: CleanCoreLevel = STATE_TO_LEVEL[entry.state] ?? "D";

  const successor: SAPObject["successor"] = entry.successorClassification
    ? {
        classification: entry.successorClassification,
        objects: entry.successors?.map((s) => ({
          objectType: (s.tadirObject ?? s.objectType ?? "").trim(),
          objectName: (s.tadirObjName ?? s.objectKey ?? "").trim(),
        })).filter((s) => s.objectType && s.objectName),
        conceptName: entry.successorConceptName,
      }
    : undefined;

  return {
    objectType,
    objectName,
    softwareComponent: entry.softwareComponent ?? "",
    applicationComponent: entry.applicationComponent ?? "",
    state: entry.state,
    cleanCoreLevel: level,
    source,
    successor,
  };
}

async function loadLocalJson(filename: string): Promise<SAPObject[]> {
  const filePath = join(SOURCES_DIR, filename);
  const raw = await readFile(filePath, "utf-8");
  const parsed: RawReleaseFile = JSON.parse(raw);
  const entries: RawObjectEntry[] = parsed.objectReleaseInfo ?? parsed.objectClassifications ?? [];
  const source: "released" | "classicApi" =
    filename.startsWith("objectClassifications") ? "classicApi" : "released";
  return entries.flatMap((e) => {
    const obj = normalizeEntry(e, source);
    return obj ? [obj] : [];
  });
}

// ---------------------------------------------------------------------------
// DataStore builder
// ---------------------------------------------------------------------------

export function buildDataStore(objects: SAPObject[]): DataStore {
  // Deduplicate: "released" wins over "classicApi" for the same key
  const merged = new Map<string, SAPObject>();
  for (const obj of objects) {
    const key = `${obj.objectType}:${obj.objectName}`;
    const existing = merged.get(key);
    if (!existing || (existing.source === "classicApi" && obj.source === "released")) {
      merged.set(key, obj);
    }
  }

  const allObjects = Array.from(merged.values());

  const byType = new Map<string, SAPObject[]>();
  const byLevel = new Map<CleanCoreLevel, SAPObject[]>();
  const byAppComponent = new Map<string, SAPObject[]>();

  for (const obj of allObjects) {
    // byType
    if (!byType.has(obj.objectType)) byType.set(obj.objectType, []);
    byType.get(obj.objectType)!.push(obj);

    // byLevel
    if (!byLevel.has(obj.cleanCoreLevel)) byLevel.set(obj.cleanCoreLevel, []);
    byLevel.get(obj.cleanCoreLevel)!.push(obj);

    // byAppComponent (index first segment e.g. "MM" from "MM-PUR")
    if (obj.applicationComponent) {
      const comp = obj.applicationComponent;
      if (!byAppComponent.has(comp)) byAppComponent.set(comp, []);
      byAppComponent.get(comp)!.push(obj);
    }
  }

  return { objectsMap: merged, byType, byLevel, byAppComponent, allObjects };
}

// ---------------------------------------------------------------------------
// Public data accessor
// ---------------------------------------------------------------------------

export async function getDataStore(systemType: SystemType): Promise<DataStore> {
  const cached = storeCache.get(systemType);
  if (cached) return cached;

  const mainObjects = await loadLocalJson(SOURCE_FILES[systemType]);

  let allObjects = mainObjects;
  if (systemType === "private_cloud" || systemType === "on_premise") {
    try {
      const classicObjects = await loadLocalJson(CLASSIC_API_FILE);
      allObjects = [...mainObjects, ...classicObjects];
    } catch {
      // classic API file missing — proceed without it
    }
  }

  const store = buildDataStore(allObjects);
  storeCache.set(systemType, store);
  return store;
}

// ---------------------------------------------------------------------------
// PCE version discovery (from local files)
// ---------------------------------------------------------------------------

export function discoverPCEVersions(): string[] {
  if (pceVersionsCache) return pceVersionsCache;
  try {
    const files = readdirSync(SOURCES_DIR);
    pceVersionsCache = files
      .filter((f) => /^objectReleaseInfo_PCE\d[\d_]*\.json$/.test(f))
      .map((f) => f.replace("objectReleaseInfo_PCE", "").replace(".json", ""))
      .sort();
  } catch {
    pceVersionsCache = [];
  }
  return pceVersionsCache;
}

// ---------------------------------------------------------------------------
// Context summary for tool description injection
// ---------------------------------------------------------------------------

function buildContextSummary(store: DataStore, pceVersions: string[]): string {
  const total = store.allObjects.length;

  const levelCounts: Record<CleanCoreLevel, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const [level, objs] of store.byLevel) {
    levelCounts[level] = objs.length;
  }

  // Top 10 object types by count
  const typeCounts: Array<[string, number]> = Array.from(store.byType.entries())
    .map(([t, objs]) => [t, objs.length] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const typeStr = typeCounts.map(([t, n]) => `${t}(${n.toLocaleString()})`).join(" ");
  const versionsStr = pceVersions.length ? pceVersions.join(" ") : "none";

  return [
    `SAP Released Objects (public_cloud): ${total.toLocaleString()} total`,
    `Levels: A=Released(${levelCounts.A.toLocaleString()}) B=Classic(${levelCounts.B.toLocaleString()}) C=Internal(${levelCounts.C.toLocaleString()}) D=NoAPI(${levelCounts.D.toLocaleString()})`,
    `Top types: ${typeStr}`,
    `PCE versions: ${versionsStr}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Prefetch (fire-and-forget at startup)
// ---------------------------------------------------------------------------

export async function prefetchReleasedObjects(): Promise<void> {
  try {
    const store = await getDataStore("public_cloud");
    const pceVersions = discoverPCEVersions();
    releasedObjectsContext = {
      summary: buildContextSummary(store, pceVersions),
      loadedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[SAP Released Objects] Prefetch failed:", err);
  }
}

export function getReleasedObjectsContext(): ReleasedObjectsContext | undefined {
  return releasedObjectsContext;
}

export { CLEAN_CORE_LEVEL_LABELS };
