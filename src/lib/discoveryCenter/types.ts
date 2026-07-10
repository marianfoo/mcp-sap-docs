// SAP Discovery Center types
// REST API used by the SAP Discovery Center UI at /servicecatalog/api/v1/

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface DiscoveryCenterSearchOptions {
  query: string;
  top?: number;
  category?: string;
  licenseModel?: string;
}

export interface DiscoveryCenterSearchResult {
  id: string;
  name: string;
  shortName: string;
  description: string;
  category: string;
  additionalCategories: string;
  licenseModelType: string;
  provider: string;
  tags: string;
  ribbon: string;
  isDeprecated: boolean;
}

export interface DiscoveryCenterSearchResponse {
  services: DiscoveryCenterSearchResult[];
  total: number;
}

// ---------------------------------------------------------------------------
// Service Details
// ---------------------------------------------------------------------------

export interface DiscoveryCenterServiceOptions {
  serviceId: string;
  currency?: string;
  includeRoadmap?: boolean;
  includePricing?: boolean;
}

export interface ResourceLink {
  title: string;
  url: string;
}

export interface ResourceGroup {
  documentation: ResourceLink[];
  tutorials: ResourceLink[];
  community: ResourceLink[];
  support: ResourceLink[];
  calculator: ResourceLink[];
}

export interface Headline {
  headline: string;
  description: string;
}

export interface MetricInfo {
  name: string;
  description: string;
  code: string;
}

export interface PlanFeature {
  name: string;
  value: string;
}

export interface CommercialModel {
  model: string;
  metric: string;
  chargingPeriod: string;
  pricePerUnit: string;
  blockSize: string;
  includedQuantity: string;
}

export interface PricingPlan {
  planName: string;
  planCode: string;
  description: string;
  usageType: string | null;
  features: PlanFeature[];
  commercialModels: CommercialModel[];
}

export interface RoadmapDeliverable {
  title: string;
  description: string;
  type: string;
  tags: string;
}

export interface RoadmapCategory {
  category: string;
  deliverables: RoadmapDeliverable[];
}

export interface RoadmapPeriod {
  title: string;
  categories: RoadmapCategory[];
}

export interface ServiceRoadmap {
  periods: RoadmapPeriod[];
}

export interface ServiceLinks {
  calculator: string | null;
  sapStore: string | null;
  featureDescription: string | null;
  discoveryCenter: string;
}

export interface DiscoveryCenterServiceResponse {
  name: string;
  shortName: string;
  description: string;
  category: string;
  additionalCategories: string;
  productType: string;
  licenseModelType: string;
  tags: string;
  csnComponent: string;
  links: ServiceLinks;
  headlines: Headline[];
  resources: ResourceGroup;
  metrics: MetricInfo[];
  pricing: PricingPlan[] | null;
  roadmap: ServiceRoadmap | null;
}

// ---------------------------------------------------------------------------
// Raw REST response shapes (internal, not exported from index)
// ---------------------------------------------------------------------------

export interface RawServiceEntity {
  id: string;
  name: string;
  shortName?: string;
  shortDesc?: string;
  category?: string;
  additionalCategories?: string;
  licenseModelType?: string;
  provider?: string;
  tags?: string;
  ribbon?: string;
  isDeprecatedService?: boolean;
  icon?: string;
  hasSapStoreLink?: boolean;
  materialId?: string;
  regionDataCenter?: string;
  productId?: string;
}

export interface RawResource {
  FileName: string;
  FileType: string;
  FolderType: string;
  Id: number;
  Location: string;
  RowOrder: number;
  ShortDescription: string | null;
}

export interface RawHeadline {
  Headline: string;
  Description: string;
  RowOrder: number;
}

export interface RawMetric {
  Id: number;
  Name: string;
  Description: string;
  Code: string;
}

export interface RawBlockRate {
  Id: string;
  BlockSize: string;
  ChargingPeriod: string;
  MetricId: string;
  PricePerBlock: string;
  IncludedQuantity: string;
}

export interface RawRatePlan {
  Id: string;
  Currency: string;
  ValidFrom: string;
  ValidTo: string;
  blockRates: RawBlockRate[];
  allUnitVolumes: unknown[];
}

export interface RawMaterial {
  ChargingPeriod: string;
  Id: string;
  MaterialId: string;
  MetricId: string;
  ZeroValueAllowed: boolean;
}

export interface RawEntitlementPlan {
  CommercialModels: string;
  DirectBillingRelationship: string;
  External: boolean;
  Id: string;
  TechAssetVariantsString: string;
  UsageType: string | null;
  environments: unknown[];
  materials: RawMaterial[];
  IncludedServiceMetadata: unknown[];
  ratePlans: RawRatePlan[];
}

export interface RawPlanFeature {
  Id: number;
  MoreInfoLink: string | null;
  MoreInfoName: string | null;
  Name: string;
  Quantity: string;
  Value: string;
}

export interface RawServicePlan {
  Code: string;
  Description: string;
  UsageType: string | null;
  Id: string;
  Name: string;
  ServicePlanOrder: number;
  features: RawPlanFeature[];
  environments: unknown[];
  IncludedServices: unknown[];
  RequiredServices: unknown[];
  entitlementPlans: RawEntitlementPlan[];
}

export interface RawCertification {
  Name: string;
  Link: string;
}

export interface RawServiceDetails {
  AdditionalCategories: string;
  CalculatorLink: string | null;
  Category: string;
  CsnComponent: string;
  FeatureDescLink: string | null;
  Icon: string;
  Id: string;
  LicenseModelType: string;
  LongDescription: string;
  MaterialId: string;
  Name: string;
  ParentService: string | null;
  PricingExample: string | null;
  ProductId: string;
  ProductType: string;
  ReferencedTools: string;
  SapStoreLink: string | null;
  ServiceJiraId: string;
  ShortDescription: string;
  ShortName: string;
  Tags: string;
  IsDeprecatedService: boolean;
  resources: RawResource[];
  certifications: RawCertification[];
  headlines: RawHeadline[];
  metrics: RawMetric[];
  servicePlans: RawServicePlan[];
}

// Roadmap raw types
export interface RawRoadmapDeliverable {
  id: number;
  deliveryId: string;
  deliveryStatus: string | null;
  description: string;
  serviceId: string;
  tags: string;
  title: string;
  type: string;
}

export interface RawRoadmapPeriodCategory {
  id: number;
  title: string;
  deliverables: RawRoadmapDeliverable[];
}

export interface RawRoadmapPeriod {
  id: number;
  releasedVersions: string | null;
  title: string;
  categories: RawRoadmapPeriodCategory[];
}

export interface RawRoadmap {
  id: number;
  productId: string;
  periods: RawRoadmapPeriod[];
}

export interface RawServiceRoadmap {
  id: string;
  name: string;
  roadmap: { id: number } | null;
}
