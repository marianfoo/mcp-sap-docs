/**
 * Tests for SAP Released Objects module.
 * Uses fixture JSON through the production loader; no sources/ checkout or network needed.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildDataStore, getDataStore,
} from "../dist/src/lib/sapReleasedObjects/dataLoader.js";
import type {
  SAPObject,
  DataStore,
  RawObjectEntry,
} from "../dist/src/lib/sapReleasedObjects/types.js";

import { searchObjects, getObjectDetails } from "../dist/src/lib/sapReleasedObjects/search.js";

vi.mock("fs/promises", () => ({ readFile: vi.fn() }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadFixture(): { objectReleaseInfo: RawObjectEntry[] } {
  const fixturePath = path.join(__dirname, "fixtures", "sap-released-objects-sample.json");
  return JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
}

const identityFixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "sap-object-identities.json"), "utf-8"
));
const boundaryEntries: RawObjectEntry[] = [
  { objectType: "FUNC", objectKey: "ACTUAL_ONLY", state: "released" },
  { objectType: "FUNC", objectKey: " ", tadirObject: "FUGR", tadirObjName: "PARTIAL_ACTUAL", state: "released" },
  { objectKey: "WRONG_PAIR", tadirObject: "TABL", tadirObjName: "LEGACY_PAIR", state: "released" },
  { objectType: "CLAS", objectKey: "VALID_ACTUAL", tadirObject: "TABL", state: "released",
    successorClassification: "multipleObjects", successors: [
      { objectType: "FUNC", objectKey: "ACTUAL_ONLY" },
      { objectType: "FUNC", objectKey: " ", tadirObject: "TABL", tadirObjName: "VBAK" },
      { objectType: "FUNC" },
      { objectType: "FUNC", objectKey: "UNKNOWN_SUCCESSOR" },
    ],
  },
  { objectType: " FUNC ", objectKey: " Trimmed_Name ", tadirObject: " FUGR ", tadirObjName: " Trimmed_Group ", state: "unknown" },
  { objectType: "FUNC", objectKey: "ALIAS_COLLISION", tadirObject: "CLAS", tadirObjName: "CL_ABAP_REGEX", state: "noAPI" },
  { objectType: "FUNC", state: "released" },
  { objectKey: "NO_TYPE", tadirObject: "FUGR", state: "released" },
  { tadirObject: " ", tadirObjName: " ", state: "released" },
];

beforeAll(() => {
  const objectReleaseInfo = [
    // First, so ALIAS_COLLISION owns the CLAS:CL_ABAP_REGEX alias.
    ...boundaryEntries,
    ...loadFixture().objectReleaseInfo,
    ...identityFixture.objectReleaseInfo,
  ];
  vi.mocked(readFile).mockImplementation(async (filename) => {
    if (String(filename).endsWith("objectClassifications_SAP.json")) {
      return JSON.stringify({ objectClassifications: [
        { objectType: "FUNC", objectKey: "BAPI_COSTCENTER_GETDETAIL", tadirObject: "FUGR", tadirObjName: "0012", state: "classicAPI" },
        { tadirObject: "CLAS", tadirObjName: "CL_CLASSIC_ONLY", state: "classicAPI" },
      ] });
    }
    return JSON.stringify({ objectReleaseInfo });
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildDataStore", () => {
  let store: DataStore;

  beforeAll(async () => {
    store = await getDataStore("public_cloud");
  });

  it("indexes objects in objectsMap with TYPE:NAME key", () => {
    expect(store.objectsMap.has("CLAS:CL_ABAP_REGEX")).toBe(true);
    expect(store.objectsMap.has("TABL:EKKO")).toBe(true);
    expect(store.objectsMap.has("INTF:IF_OS_TRANSACTION")).toBe(true);
  });

  it("populates allObjects with all deduplicated entries", () => {
    expect(store.allObjects).toHaveLength(21);
    expect(new Set(store.allObjects.map(o => `${o.objectType}:${o.objectName}`)).size).toBe(21);
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
    classes!.forEach((o) => expect([o.objectType, o.tadirObject]).toContain("CLAS"));
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

  it("keeps all actual objects while preferring released data for a shared TADIR alias", () => {
    const base: SAPObject = { objectType: "FUNC", objectName: "CLASSIC_MEMBER", tadirObject: "FUGR", tadirObjName: "SHARED_GROUP", softwareComponent: "", applicationComponent: "", state: "classicAPI", cleanCoreLevel: "B", source: "classicApi" };
    const released: SAPObject = { ...base, objectName: "RELEASED_MEMBER", state: "released", cleanCoreLevel: "A", source: "released" };
    for (const entries of [[base, released], [released, base]]) {
      const result = buildDataStore(entries);
      expect(result.allObjects).toHaveLength(2);
      expect(result.byType.get("FUGR")).toHaveLength(2);
      expect(result.tadirMap.get("FUGR:SHARED_GROUP")).toBe(released);
    }
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


describe("actual object identities and TADIR compatibility (#91)", () => {
  it.each(["public_cloud", "private_cloud", "on_premise", "btp"] as const)(
    "finds the BAPI by its actual name in %s", async (system_type) => {
      const result = await searchObjects({ query: "BAPI_COSTCENTER_GETDETAIL", clean_core_level: "D", system_type });
      expect(result.total).toBe(1);
      expect(result.objects[0]).toMatchObject({
        objectType: "FUNC", objectName: "BAPI_COSTCENTER_GETDETAIL",
        tadirObject: "FUGR", tadirObjName: "0012", source: "released",
        state: "notToBeReleased", cleanCoreLevel: "C",
      });
    }
  );

  it("keeps both function modules in the same function group", async () => {
    const result = await searchObjects({ object_type: "func", query: "BAPI_COSTCENTER_", clean_core_level: "D" });
    expect(result.objects.map(o => o.objectName).sort()).toEqual(["BAPI_COSTCENTER_GETDETAIL", "BAPI_COSTCENTER_GETLIST"]);
  });

  it("accepts TADIR type and name filters without merging members", async () => {
    const result = await searchObjects({ object_type: "fugr", query: "0012", clean_core_level: "D" });
    expect(result.total).toBe(2);
    expect(result.objects.every(o => o.objectType === "FUNC" && o.tadirObject === "FUGR")).toBe(true);
  });

  it("keeps counts and pagination unique when matching TADIR aliases", async () => {
    const first = await searchObjects({ query: "0012", clean_core_level: "D", limit: 1 });
    const second = await searchObjects({ query: "0012", clean_core_level: "D", limit: 1, offset: first.nextOffset });
    expect(first).toMatchObject({ total: 2, hasMore: true, nextOffset: 1 });
    expect(second).toMatchObject({ total: 2, hasMore: false });
    expect(first.objects[0].objectName).not.toBe(second.objects[0].objectName);
  });

  it("resolves actual details and enriches the CDS successor", async () => {
    const result = await getObjectDetails({ object_type: "func", object_name: "bapi_costcenter_getdetail", target_clean_core_level: "A" });
    expect(result).toMatchObject({ found: true, objectType: "FUNC", objectName: "BAPI_COSTCENTER_GETDETAIL", tadirObject: "FUGR", tadirObjName: "0012", complianceStatus: "non_compliant" });
    expect(result.successor?.objects).toEqual([{
      objectType: "CDS_STOB", objectName: "I_COSTCENTER", tadirObject: "DDLS", tadirObjName: "I_COSTCENTER",
    }]);
    expect(result.successorObjects).toHaveLength(1);
    expect(result.successorObjects![0]).toMatchObject({ objectType: "CDS_STOB", objectName: "I_COSTCENTER", state: "released" });
  });

  it("keeps case-insensitive TADIR detail fallback", async () => {
    const result = await getObjectDetails({ object_type: "fugr", object_name: "0012" });
    expect(result).toMatchObject({ found: true, objectType: "FUNC", objectName: "BAPI_COSTCENTER_GETLIST", tadirObject: "FUGR", tadirObjName: "0012" });
  });

  it("does not confuse two BAdIs and a successor sharing one enhancement spot", async () => {
    const result = await getObjectDetails({ object_type: "BADI_DEF", object_name: "EDC_DETERMINE_RESULT_PROC_CUST" });
    expect(result).toMatchObject({ found: true, state: "deprecated", tadirObject: "ENHS", tadirObjName: "ES_EDC_CONSISTENCY_CLOUD" });
    expect(result.successorObjects).toHaveLength(1);
    expect(result.successorObjects![0].objectName).toBe("EDC_MODIFY_CHECK_RESULT");
    const search = await searchObjects({ object_type: "ENHS", query: "ES_EDC_CONSISTENCY_CLOUD", clean_core_level: "D" });
    expect(search.total).toBe(2);
    expect(search.objects.every(o => o.objectType === "BADI_DEF")).toBe(true);
  });

  it.each(["CDS_STOB", "DDLS"])("accepts the %s type for a CDS view once", async (object_type) => {
    const result = await searchObjects({ object_type, query: "I_COSTCENTER", clean_core_level: "A" });
    expect(result.total).toBe(1);
    expect(result.objects[0].objectType).toBe("CDS_STOB");
    expect(await getObjectDetails({ object_type, object_name: "I_COSTCENTER" })).toMatchObject({ found: true, objectType: "CDS_STOB" });
  });

  it("prefers an exact actual identity over another object's TADIR alias", async () => {
    expect(await getObjectDetails({ object_type: "CLAS", object_name: "CL_ABAP_REGEX" })).toMatchObject({ found: true, objectType: "CLAS", objectName: "CL_ABAP_REGEX", state: "released" });
  });

  it("applies level, state and component filters to actual objects", async () => {
    expect((await searchObjects({ object_type: "FUNC", query: "BAPI_COSTCENTER_", clean_core_level: "A" })).total).toBe(0);
    const result = await searchObjects({ object_type: "FUGR", query: "0012", clean_core_level: "C", state: "notToBeReleased", app_component: "co-om" });
    expect(result.total).toBe(2);
    expect((await searchObjects({ object_type: "FUNC", query: "BAPI_COSTCENTER_", clean_core_level: "D", app_component: "MM" })).total).toBe(0);
  });

  it("preserves legacy-only and actual-only objects", async () => {
    expect(await getObjectDetails({ object_type: "TABL", object_name: "VBAK" })).toMatchObject({ found: true, objectType: "TABL", objectName: "VBAK" });
    expect(await getObjectDetails({ object_type: "FUNC", object_name: "ACTUAL_ONLY" })).toMatchObject({ found: true, objectType: "FUNC", objectName: "ACTUAL_ONLY" });
  });

  it("falls back using a complete identity pair, never mixing partial identities", async () => {
    expect(await getObjectDetails({ object_type: "FUGR", object_name: "PARTIAL_ACTUAL" })).toMatchObject({ found: true, objectType: "FUGR" });
    expect(await getObjectDetails({ object_type: "TABL", object_name: "LEGACY_PAIR" })).toMatchObject({ found: true, objectName: "LEGACY_PAIR" });
    expect(await getObjectDetails({ object_type: "FUGR", object_name: "NO_TYPE" })).toMatchObject({ found: false });
    const valid = await getObjectDetails({ object_type: "CLAS", object_name: "VALID_ACTUAL" });
    expect(valid).toMatchObject({ found: true, objectType: "CLAS" });
    expect(valid.tadirObject).toBeUndefined();
  });

  it("uses complete successor pairs and does not invent details for missing successors", async () => {
    const result = await getObjectDetails({ object_type: "CLAS", object_name: "VALID_ACTUAL" });
    expect(result.successor?.objects).toEqual([
      { objectType: "FUNC", objectName: "ACTUAL_ONLY" },
      { objectType: "TABL", objectName: "VBAK", tadirObject: "TABL", tadirObjName: "VBAK" },
      { objectType: "FUNC", objectName: "UNKNOWN_SUCCESSOR" },
    ]);
    expect(result.successorObjects?.map(o => o.objectName)).toEqual(["ACTUAL_ONLY", "VBAK"]);
  });

  it("trims identities and resolves case-insensitive primary and TADIR keys", async () => {
    for (const [object_type, object_name] of [["func", "trimmed_name"], ["fugr", "trimmed_group"]]) {
      expect(await getObjectDetails({ object_type, object_name })).toMatchObject({ found: true, objectType: "FUNC", objectName: "Trimmed_Name", cleanCoreLevel: "D" });
    }
  });

  it("counts actual objects once even when their alias has the same type", async () => {
    const result = await searchObjects({ object_type: "CLAS", query: "CL_ABAP_MATCHER", clean_core_level: "D" });
    expect(result.total).toBe(1);
  });

  it("keeps private-cloud classic-only entries and released-source precedence", async () => {
    expect(await getObjectDetails({ object_type: "FUNC", object_name: "BAPI_COSTCENTER_GETDETAIL", system_type: "private_cloud" })).toMatchObject({ source: "released", state: "notToBeReleased" });
    expect(await getObjectDetails({ object_type: "CLAS", object_name: "CL_CLASSIC_ONLY", system_type: "private_cloud" })).toMatchObject({ source: "classicApi", cleanCoreLevel: "B" });
    expect(await getObjectDetails({ object_type: "CLAS", object_name: "CL_CLASSIC_ONLY", system_type: "public_cloud" })).toMatchObject({ found: false });
  });
});
