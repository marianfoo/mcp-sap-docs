/**
 * Tests for SAP Released Objects module.
 * Uses a fixture JSON file and does NOT access the filesystem (sources/) or network.
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildDataStore,
} from "../dist/src/lib/sapReleasedObjects/dataLoader.js";
import type {
  SAPObject,
  DataStore,
  RawObjectEntry,
} from "../dist/src/lib/sapReleasedObjects/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadFixture(): { objectReleaseInfo: RawObjectEntry[] } {
  const fixturePath = path.join(__dirname, "fixtures", "sap-released-objects-sample.json");
  return JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
}

function rawToSAPObjects(
  entries: RawObjectEntry[],
  source: "released" | "classicApi" = "released"
): SAPObject[] {
  return entries.flatMap((e) => {
    const objectType = (e.tadirObject ?? e.objectType ?? "").trim();
    const objectName = (e.tadirObjName ?? e.objectKey ?? "").trim();
    if (!objectType || !objectName) return [];
    const stateMap: Record<string, string> = {
      released: "A", deprecated: "A", classicAPI: "B",
      stable: "C", notToBeReleased: "C", noAPI: "D",
    };
    const level = (stateMap[e.state] ?? "D") as any;
    return [{
      objectType,
      objectName,
      softwareComponent: e.softwareComponent ?? "",
      applicationComponent: e.applicationComponent ?? "",
      state: e.state,
      cleanCoreLevel: level,
      source,
      successor: e.successorClassification
        ? {
            classification: e.successorClassification,
            objects: e.successors?.map((s) => ({
              objectType: (s.tadirObject ?? s.objectType ?? "").trim(),
              objectName: (s.tadirObjName ?? s.objectKey ?? "").trim(),
            })).filter((s) => s.objectType && s.objectName),
          }
        : undefined,
    }];
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildDataStore", () => {
  let fixture: ReturnType<typeof loadFixture>;
  let objects: SAPObject[];
  let store: DataStore;

  beforeAll(() => {
    fixture = loadFixture();
    objects = rawToSAPObjects(fixture.objectReleaseInfo);
    store = buildDataStore(objects);
  });

  it("indexes objects in objectsMap with TYPE:NAME key", () => {
    expect(store.objectsMap.has("CLAS:CL_ABAP_REGEX")).toBe(true);
    expect(store.objectsMap.has("TABL:EKKO")).toBe(true);
    expect(store.objectsMap.has("INTF:IF_OS_TRANSACTION")).toBe(true);
  });

  it("populates allObjects with all deduplicated entries", () => {
    expect(store.allObjects.length).toBeGreaterThan(0);
    expect(store.allObjects.length).toBeLessThanOrEqual(objects.length);
  });

  it("maps state=released to cleanCoreLevel A", () => {
    const obj = store.objectsMap.get("CLAS:CL_ABAP_REGEX");
    expect(obj?.cleanCoreLevel).toBe("A");
    expect(obj?.state).toBe("released");
  });

  it("maps state=deprecated to cleanCoreLevel A", () => {
    const obj = store.objectsMap.get("TABL:EKKO");
    expect(obj?.cleanCoreLevel).toBe("A");
    expect(obj?.state).toBe("deprecated");
  });

  it("maps state=classicAPI to cleanCoreLevel B", () => {
    const obj = store.objectsMap.get("CLAS:CL_GUI_FRONTEND_SERVICES");
    expect(obj?.cleanCoreLevel).toBe("B");
  });

  it("maps state=notToBeReleased to cleanCoreLevel C", () => {
    const obj = store.objectsMap.get("FUGR:SAPL_OBSOLETE");
    expect(obj?.cleanCoreLevel).toBe("C");
  });

  it("maps state=stable to cleanCoreLevel C", () => {
    const obj = store.objectsMap.get("TABL:VBAK");
    expect(obj?.cleanCoreLevel).toBe("C");
  });

  it("maps state=noAPI to cleanCoreLevel D", () => {
    const obj = store.objectsMap.get("TABL:MARA");
    expect(obj?.cleanCoreLevel).toBe("D");
  });

  it("indexes objects by type in byType map", () => {
    const classes = store.byType.get("CLAS");
    expect(classes).toBeDefined();
    expect(classes!.length).toBeGreaterThanOrEqual(2);
    classes!.forEach((o) => expect(o.objectType).toBe("CLAS"));
  });

  it("indexes objects by level in byLevel map", () => {
    const levelA = store.byLevel.get("A");
    expect(levelA).toBeDefined();
    expect(levelA!.every((o) => o.cleanCoreLevel === "A")).toBe(true);
  });

  it("indexes objects by applicationComponent in byAppComponent map", () => {
    const mmPur = store.byAppComponent.get("MM-PUR");
    expect(mmPur).toBeDefined();
    expect(mmPur!.length).toBeGreaterThanOrEqual(1);
  });

  it("deduplicates: released source wins over classicApi for same key", () => {
    // Build a store with a duplicate: same object in both sources
    const classicVersion: SAPObject = {
      objectType: "CLAS",
      objectName: "CL_DUPLICATE",
      softwareComponent: "SAP_BASIS",
      applicationComponent: "BC",
      state: "classicAPI",
      cleanCoreLevel: "B",
      source: "classicApi",
    };
    const releasedVersion: SAPObject = {
      objectType: "CLAS",
      objectName: "CL_DUPLICATE",
      softwareComponent: "SAP_BASIS",
      applicationComponent: "BC",
      state: "released",
      cleanCoreLevel: "A",
      source: "released",
    };
    const deduped = buildDataStore([classicVersion, releasedVersion]);
    const obj = deduped.objectsMap.get("CLAS:CL_DUPLICATE");
    expect(obj?.source).toBe("released");
    expect(obj?.cleanCoreLevel).toBe("A");
  });

  it("stores successor info on deprecated objects", () => {
    const ekko = store.objectsMap.get("TABL:EKKO");
    expect(ekko?.successor).toBeDefined();
    expect(ekko?.successor?.classification).toBe("replacedBy");
    expect(ekko?.successor?.objects).toHaveLength(1);
    expect(ekko?.successor?.objects![0].objectType).toBe("DDLS");
    expect(ekko?.successor?.objects![0].objectName).toBe("I_PURCHASEORDER");
  });
});
