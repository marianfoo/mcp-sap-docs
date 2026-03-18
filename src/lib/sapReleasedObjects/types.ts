export type CleanCoreLevel = "A" | "B" | "C" | "D";
export type SystemType = "public_cloud" | "btp" | "private_cloud" | "on_premise";

export interface RawObjectEntry {
  tadirObject?: string;
  objectType?: string;
  tadirObjName?: string;
  objectKey?: string;
  state: string;
  softwareComponent?: string;
  applicationComponent?: string;
  successorClassification?: string;
  successors?: Array<{
    tadirObject?: string;
    objectType?: string;
    tadirObjName?: string;
    objectKey?: string;
  }>;
  successorConceptName?: string;
}

export interface RawReleaseFile {
  formatVersion?: string;
  objectReleaseInfo?: RawObjectEntry[];
  objectClassifications?: RawObjectEntry[];
}

export interface SAPObject {
  objectType: string;
  objectName: string;
  softwareComponent: string;
  applicationComponent: string;
  state: string;
  cleanCoreLevel: CleanCoreLevel;
  source: "released" | "classicApi";
  successor?: {
    classification: string;
    objects?: Array<{ objectType: string; objectName: string }>;
    conceptName?: string;
  };
}

export interface DataStore {
  objectsMap: Map<string, SAPObject>;
  byType: Map<string, SAPObject[]>;
  byLevel: Map<CleanCoreLevel, SAPObject[]>;
  byAppComponent: Map<string, SAPObject[]>;
  allObjects: SAPObject[];
}

export interface SearchObjectsOptions {
  query?: string;
  system_type?: SystemType;
  clean_core_level?: CleanCoreLevel;
  object_type?: string;
  app_component?: string;
  state?: string;
  limit?: number;
  offset?: number;
}

export interface SearchObjectsResult {
  objects: SAPObject[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
  systemType: SystemType;
}

export interface GetObjectDetailsOptions {
  object_type: string;
  object_name: string;
  system_type?: SystemType;
  target_clean_core_level?: CleanCoreLevel;
}

export interface ObjectDetailsResult {
  found: boolean;
  objectType?: string;
  objectName?: string;
  systemType?: SystemType;
  softwareComponent?: string;
  applicationComponent?: string;
  state?: string;
  cleanCoreLevel?: CleanCoreLevel;
  cleanCoreLevelLabel?: string;
  source?: "released" | "classicApi";
  successor?: SAPObject["successor"];
  successorObjects?: SAPObject[];
  complianceStatus?: "compliant" | "warning" | "non_compliant";
}

export interface ReleasedObjectsContext {
  summary: string;
  loadedAt: string;
}
