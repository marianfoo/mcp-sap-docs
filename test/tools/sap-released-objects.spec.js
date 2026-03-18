/**
 * Integration tests for SAP Released Objects tools.
 * These tests call searchObjects() and getObjectDetails() directly against
 * the real local data from sources/abap-atc-cr-cv-s4hc/src/.
 *
 * Requires: sources/abap-atc-cr-cv-s4hc to be cloned (via setup.sh or git submodule update).
 */
import { searchObjects, getObjectDetails } from "../../dist/src/lib/sapReleasedObjects/index.js";
import { existsSync } from "node:fs";

const SOURCE_DIR = "sources/abap-atc-cr-cv-s4hc/src";
const SKIP_REASON = "sources/abap-atc-cr-cv-s4hc not present — run setup.sh first";
const dataAvailable = existsSync(SOURCE_DIR);

export default [
  {
    name: "sap_search_objects: finds level-A objects with no query",
    validate: async () => {
      if (!dataAvailable) return { skipped: true, message: SKIP_REASON };
      const result = await searchObjects({ system_type: "public_cloud", clean_core_level: "A", limit: 10 });
      const ok =
        result.objects.length > 0 &&
        result.total > 0 &&
        result.objects.every((o) => o.cleanCoreLevel === "A" || o.cleanCoreLevel === undefined);
      return { passed: ok, message: ok ? "" : `Unexpected result: total=${result.total}, objects=${result.objects.length}` };
    },
  },
  {
    name: "sap_search_objects: filters by object_type CLAS",
    validate: async () => {
      if (!dataAvailable) return { skipped: true, message: SKIP_REASON };
      const result = await searchObjects({ object_type: "CLAS", limit: 20 });
      const allClas = result.objects.every((o) => o.objectType === "CLAS");
      return {
        passed: result.objects.length > 0 && allClas,
        message: allClas ? "" : "Some objects have wrong type",
      };
    },
  },
  {
    name: "sap_search_objects: query scoring returns relevant results first",
    validate: async () => {
      if (!dataAvailable) return { skipped: true, message: SKIP_REASON };
      const result = await searchObjects({ query: "CL_ABAP_REGEX", clean_core_level: "D", limit: 5 });
      const found = result.objects.some(
        (o) => o.objectName.toUpperCase() === "CL_ABAP_REGEX"
      );
      return { passed: found, message: found ? "" : "CL_ABAP_REGEX not found in top results" };
    },
  },
  {
    name: "sap_search_objects: pagination works correctly",
    validate: async () => {
      if (!dataAvailable) return { skipped: true, message: SKIP_REASON };
      const page1 = await searchObjects({ object_type: "CLAS", limit: 5, offset: 0 });
      const page2 = await searchObjects({ object_type: "CLAS", limit: 5, offset: 5 });
      const noOverlap = !page1.objects.some(
        (o) => page2.objects.some((p) => p.objectName === o.objectName)
      );
      const ok = page1.objects.length === 5 && noOverlap;
      return { passed: ok, message: ok ? "" : "Pagination overlap or wrong count" };
    },
  },
  {
    name: "sap_get_object_details: returns full details for released object",
    validate: async () => {
      if (!dataAvailable) return { skipped: true, message: SKIP_REASON };
      const result = await getObjectDetails({ object_type: "CLAS", object_name: "CL_ABAP_REGEX" });
      const ok =
        result.found === true &&
        result.objectType === "CLAS" &&
        result.objectName === "CL_ABAP_REGEX" &&
        result.cleanCoreLevel !== undefined &&
        result.state !== undefined;
      return { passed: ok, message: ok ? "" : `Unexpected result: ${JSON.stringify(result)}` };
    },
  },
  {
    name: "sap_get_object_details: returns found=false for non-existent object",
    validate: async () => {
      if (!dataAvailable) return { skipped: true, message: SKIP_REASON };
      const result = await getObjectDetails({ object_type: "CLAS", object_name: "CL_NONEXISTENT_XXXYYY_ZZZ" });
      return {
        passed: result.found === false,
        message: result.found ? "Should have returned found=false" : "",
      };
    },
  },
  {
    name: "sap_get_object_details: complianceStatus with target_clean_core_level A on released object",
    validate: async () => {
      if (!dataAvailable) return { skipped: true, message: SKIP_REASON };
      const result = await getObjectDetails({
        object_type: "CLAS",
        object_name: "CL_ABAP_REGEX",
        target_clean_core_level: "A",
      });
      const ok = result.found === true && result.complianceStatus !== undefined;
      return { passed: ok, message: ok ? "" : `complianceStatus missing: ${JSON.stringify(result)}` };
    },
  },
  {
    name: "sap_get_object_details: case-insensitive object name lookup",
    validate: async () => {
      if (!dataAvailable) return { skipped: true, message: SKIP_REASON };
      const result = await getObjectDetails({ object_type: "clas", object_name: "cl_abap_regex" });
      const ok = result.found === true && result.objectName === "CL_ABAP_REGEX";
      return { passed: ok, message: ok ? "" : `Expected found=true, got: ${JSON.stringify(result)}` };
    },
  },
];
