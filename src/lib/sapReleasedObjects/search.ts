import { getDataStore, CLEAN_CORE_LEVEL_LABELS } from "./dataLoader.js";
import { CUMULATIVE_LEVELS } from "./constants.js";
import type {
  SAPObject,
  DataStore,
  CleanCoreLevel,
  SystemType,
  SearchObjectsOptions,
  SearchObjectsResult,
  GetObjectDetailsOptions,
  ObjectDetailsResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

function scoreName(name: string, queryUpper: string, queryLower: string): number {
  const nameUpper = name.toUpperCase();
  const nameLower = name.toLowerCase();
  if (nameUpper === queryUpper) return 100;
  if (nameUpper.startsWith(queryUpper)) return 20;
  if (nameLower.includes(queryLower)) return 10;
  return 0;
}

function getFilteredByLevel(store: DataStore, level: CleanCoreLevel): SAPObject[] {
  const included = CUMULATIVE_LEVELS[level];
  const result: SAPObject[] = [];
  for (const l of included) {
    const objs = store.byLevel.get(l);
    if (objs) result.push(...objs);
  }
  return result;
}

// ---------------------------------------------------------------------------
// searchObjects
// ---------------------------------------------------------------------------

export async function searchObjects(opts: SearchObjectsOptions): Promise<SearchObjectsResult> {
  const systemType: SystemType = opts.system_type ?? "public_cloud";
  const store = await getDataStore(systemType);

  // Start with the most restrictive pre-filter set
  let candidates: SAPObject[];

  if (opts.object_type) {
    candidates = store.byType.get(opts.object_type.toUpperCase()) ?? [];
  } else if (opts.clean_core_level) {
    candidates = getFilteredByLevel(store, opts.clean_core_level);
  } else {
    // Default: level A only (released APIs)
    candidates = getFilteredByLevel(store, "A");
  }

  // Apply level filter on top of type filter
  if (opts.object_type && opts.clean_core_level) {
    const allowedLevels = new Set(CUMULATIVE_LEVELS[opts.clean_core_level]);
    candidates = candidates.filter((o) => allowedLevels.has(o.cleanCoreLevel));
  }

  // App component filter (prefix match: "MM" matches "MM-PUR", "MM-PUR-PO")
  if (opts.app_component) {
    const comp = opts.app_component.toUpperCase();
    candidates = candidates.filter(
      (o) => o.applicationComponent.toUpperCase() === comp ||
             o.applicationComponent.toUpperCase().startsWith(comp + "-")
    );
  }

  // State filter
  if (opts.state) {
    candidates = candidates.filter((o) => o.state === opts.state);
  }

  // Query scoring
  let scored: Array<{ obj: SAPObject; score: number }>;
  if (opts.query && opts.query.trim()) {
    const q = opts.query.trim();
    const qUpper = q.toUpperCase();
    const qLower = q.toLowerCase();
    scored = candidates
      .map((obj) => {
        let score = scoreName(obj.objectName, qUpper, qLower);
        if (score === 0 && obj.applicationComponent.toUpperCase().includes(qUpper)) score = 3;
        return { obj, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
  } else {
    // No query — return all candidates in order
    scored = candidates.map((obj) => ({ obj, score: 0 }));
  }

  const total = scored.length;
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 25;
  const page = scored.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return {
    objects: page.map((r) => r.obj),
    total,
    hasMore,
    nextOffset: hasMore ? offset + limit : undefined,
    systemType,
  };
}

// ---------------------------------------------------------------------------
// getObjectDetails
// ---------------------------------------------------------------------------

function computeCompliance(
  objectLevel: CleanCoreLevel,
  targetLevel: CleanCoreLevel
): "compliant" | "warning" | "non_compliant" {
  const levelOrder: Record<CleanCoreLevel, number> = { A: 0, B: 1, C: 2, D: 3 };
  const objOrder = levelOrder[objectLevel];
  const targetOrder = levelOrder[targetLevel];

  if (objOrder <= targetOrder) {
    // Object is within the allowed set — but warn if using classic APIs when A is expected
    if (targetLevel === "A" && objectLevel === "A") return "compliant";
    if (targetLevel === "A" && objectLevel !== "A") return "non_compliant";
    return "compliant";
  }
  return "non_compliant";
}

export async function getObjectDetails(opts: GetObjectDetailsOptions): Promise<ObjectDetailsResult> {
  const systemType: SystemType = opts.system_type ?? "public_cloud";
  const store = await getDataStore(systemType);

  const typeUpper = opts.object_type.toUpperCase();
  const nameUpper = opts.object_name.toUpperCase();
  const key = `${typeUpper}:${nameUpper}`;

  // Exact match first
  let obj = store.objectsMap.get(key);

  // Case-insensitive fallback
  if (!obj) {
    for (const [k, v] of store.objectsMap) {
      if (k.toUpperCase() === key) {
        obj = v;
        break;
      }
    }
  }

  if (!obj) {
    return { found: false, objectType: opts.object_type, objectName: opts.object_name, systemType };
  }

  // Enrich successors
  let successorObjects: SAPObject[] | undefined;
  if (obj.successor?.objects?.length) {
    successorObjects = obj.successor.objects.flatMap((s) => {
      const succKey = `${s.objectType}:${s.objectName}`;
      const found = store.objectsMap.get(succKey);
      return found ? [found] : [];
    });
  }

  // Compliance check
  let complianceStatus: ObjectDetailsResult["complianceStatus"] | undefined;
  if (opts.target_clean_core_level) {
    complianceStatus = computeCompliance(obj.cleanCoreLevel, opts.target_clean_core_level);
  }

  return {
    found: true,
    objectType: obj.objectType,
    objectName: obj.objectName,
    systemType,
    softwareComponent: obj.softwareComponent,
    applicationComponent: obj.applicationComponent,
    state: obj.state,
    cleanCoreLevel: obj.cleanCoreLevel,
    cleanCoreLevelLabel: CLEAN_CORE_LEVEL_LABELS[obj.cleanCoreLevel],
    source: obj.source,
    successor: obj.successor,
    successorObjects,
    complianceStatus,
  };
}
