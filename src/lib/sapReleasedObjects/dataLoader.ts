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
  ObjectIdentity,
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

function normalizeIdentity(
  entry: Pick<RawObjectEntry, "objectType" | "objectKey" | "tadirObject" | "tadirObjName">
): ObjectIdentity | null {
  const objectType = entry.objectType?.trim();
  const objectName = entry.objectKey?.trim();
  const tadirObject = entry.tadirObject?.trim();
  const tadirObjName = entry.tadirObjName?.trim();
  const tadir = tadirObject && tadirObjName ? { tadirObject, tadirObjName } : {};

  // Treat each identity as a pair; never combine an actual type with a container name.
  if (objectType && objectName) return { objectType, objectName, ...tadir };
  if (tadirObject && tadirObjName) return { objectType: tadirObject, objectName: tadirObjName, ...tadir };
  return null;
}

function normalizeEntry(entry: RawObjectEntry, source: "released" | "classicApi"): SAPObject | null {
  const identity = normalizeIdentity(entry);
  if (!identity) return null;

  const level: CleanCoreLevel = STATE_TO_LEVEL[entry.state] ?? "D";

  const successor: SAPObject["successor"] = entry.successorClassification
    ? {
        classification: entry.successorClassification,
        objects: entry.successors?.flatMap((s) => {
          const successorIdentity = normalizeIdentity(s);
          return successorIdentity ? [successorIdentity] : [];
        }),
        conceptName: entry.successorConceptName,
      }
    : undefined;

  return {
    ...identity,
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
  // Deduplicate actual objects, not their containers. Released data wins over classic API data.
  const merged = new Map<string, SAPObject>();
  for (const obj of objects) {
    const key = `${obj.objectType}:${obj.objectName}`.toUpperCase();
    const existing = merged.get(key);
    if (!existing || (existing.source === "classicApi" && obj.source === "released")) {
      merged.set(key, obj);
    }
  }

  const allObjects = Array.from(merged.values());

  const byType = new Map<string, SAPObject[]>();
  const tadirMap = new Map<string, SAPObject>();
  const byLevel = new Map<CleanCoreLevel, SAPObject[]>();
  const byAppComponent = new Map<string, SAPObject[]>();

  for (const obj of allObjects) {
    // Both type filters return the actual object, once per filter.
    const types = new Set([obj.objectType.toUpperCase()]);
    if (obj.tadirObject && obj.tadirObjName) {
      types.add(obj.tadirObject.toUpperCase());
      const key = `${obj.tadirObject}:${obj.tadirObjName}`.toUpperCase();
      const existing = tadirMap.get(key);
      // A container can have several members. Preserve the first preferred record
      // for legacy detail lookups; actual identities remain separately addressable.
      if (!existing || (existing.source === "classicApi" && obj.source === "released")) {
        tadirMap.set(key, obj);
      }
    }
    for (const type of types) {
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type)!.push(obj);
    }

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

  return { objectsMap: merged, tadirMap, byType, byLevel, byAppComponent, allObjects };
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
  const countsByType = new Map<string, number>();
  for (const obj of store.allObjects) {
    countsByType.set(obj.objectType, (countsByType.get(obj.objectType) ?? 0) + 1);
  }
  const typeCounts = Array.from(countsByType.entries())
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
