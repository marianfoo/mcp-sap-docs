// SAP Discovery Center service details with pricing and roadmap

import { callFunctionImport, callEntitySet, searchCache, detailsCache, roadmapCache } from "./api.js";
import type {
  DiscoveryCenterServiceOptions,
  DiscoveryCenterServiceResponse,
  Headline,
  MetricInfo,
  PricingPlan,
  CommercialModel,
  PlanFeature,
  ResourceGroup,
  ResourceLink,
  ServiceLinks,
  ServiceRoadmap,
  RoadmapPeriod,
  RoadmapCategory,
  RoadmapDeliverable,
  RawServiceDetails,
  RawServiceEntity,
  RawRoadmap,
  RawServiceRoadmap,
} from "./types.js";

// UUID pattern: 8-4-4-4-12 hex chars
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a service name/slug to a UUID by searching the catalog.
 * Returns the best-matching service ID, or throws if not found.
 */
async function resolveServiceId(nameOrId: string): Promise<string> {
  if (UUID_PATTERN.test(nameOrId)) return nameOrId;

  // Search for the service by name
  const raw = (await callFunctionImport(
    "GetSearchedServices",
    { searchString: nameOrId, top: "5" },
    searchCache,
  )) as { d: { results: RawServiceEntity[] } };

  const results = raw.d?.results;
  if (!results || results.length === 0) {
    throw new Error(`No service found matching "${nameOrId}". Use sap_discovery_center_search to find the correct service name or ID.`);
  }

  // Prefer exact name match (case-insensitive)
  const lower = nameOrId.toLowerCase();
  const exact = results.find(
    (s) => s.Name?.toLowerCase() === lower || s.ShortName?.toLowerCase() === lower,
  );

  return exact?.Id ?? results[0].Id;
}

/**
 * Get comprehensive details for a specific SAP BTP service.
 * Accepts either a UUID or a service name (will auto-resolve via search).
 */
export async function getDiscoveryCenterServiceDetails(
  options: DiscoveryCenterServiceOptions,
): Promise<DiscoveryCenterServiceResponse> {
  const { currency = "USD", includeRoadmap = true, includePricing = true } = options;

  // Resolve name to UUID if needed
  const serviceId = await resolveServiceId(options.serviceId);

  // Fetch service details
  const detailsRaw = (await callFunctionImport(
    "GetServicesDetails",
    { serviceId, currency },
    detailsCache,
  )) as { d: { GetServicesDetails: string } };

  const detailsStr = detailsRaw.d.GetServicesDetails;
  if (!detailsStr) {
    throw new Error(`Service not found: ${options.serviceId}`);
  }

  const details: RawServiceDetails = JSON.parse(detailsStr);

  // Fetch roadmap (if requested)
  let roadmap: ServiceRoadmap | null = null;
  if (includeRoadmap) {
    roadmap = await fetchRoadmap(serviceId);
  }

  // Format pricing
  let pricing: PricingPlan[] | null = null;
  if (includePricing && details.servicePlans?.length > 0) {
    pricing = details.servicePlans.map((plan) => formatPricingPlan(plan, currency));
  }

  const response: DiscoveryCenterServiceResponse = {
    name: details.Name,
    shortName: details.ShortName,
    description: details.LongDescription ?? details.ShortDescription,
    category: details.Category ?? "",
    additionalCategories: details.AdditionalCategories ?? "",
    productType: details.ProductType ?? "",
    licenseModelType: details.LicenseModelType ?? "",
    tags: details.Tags ?? "",
    csnComponent: details.CsnComponent ?? "",
    links: formatLinks(details),
    headlines: formatHeadlines(details),
    resources: formatResources(details),
    metrics: formatMetrics(details),
    pricing,
    roadmap,
  };

  return response;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatLinks(details: RawServiceDetails): ServiceLinks {
  return {
    calculator: details.CalculatorLink || null,
    sapStore: details.SapStoreLink || null,
    featureDescription: details.FeatureDescLink || null,
    discoveryCenter: `https://discovery-center.cloud.sap/serviceCatalog/${details.Id}`,
  };
}

function formatHeadlines(details: RawServiceDetails): Headline[] {
  if (!details.headlines) return [];
  return details.headlines
    .sort((a, b) => a.RowOrder - b.RowOrder)
    .map((h) => ({
      headline: h.Headline,
      description: h.Description,
    }));
}

function formatResources(details: RawServiceDetails): ResourceGroup {
  const group: ResourceGroup = {
    documentation: [],
    tutorials: [],
    community: [],
    support: [],
    calculator: [],
  };

  if (!details.resources) return group;

  for (const r of details.resources) {
    // Skip Carousel/Gallery images, SERVICEID (internal), General (internal Jira links)
    if (
      r.FolderType === "Carousel" ||
      r.FileType === "GALLERY" ||
      r.FileType === "SERVICEID" ||
      r.FolderType === "General"
    ) {
      continue;
    }

    const link: ResourceLink = {
      title: r.FileName,
      url: r.Location,
    };

    if (r.FolderType === "Service Information on help.sap.com") {
      group.documentation.push(link);
    } else if (r.FolderType === "Tutorial") {
      group.tutorials.push(link);
    } else if (r.FolderType === "Communities and Blogs") {
      group.community.push(link);
    } else if (r.FolderType === "Support") {
      group.support.push(link);
    } else if (r.FolderType === "Calculator") {
      group.calculator.push(link);
    }
  }

  return group;
}

function formatMetrics(details: RawServiceDetails): MetricInfo[] {
  if (!details.metrics) return [];
  return details.metrics.map((m) => ({
    name: m.Name,
    description: m.Description,
    code: m.Code,
  }));
}

function formatPricingPlan(
  plan: RawServiceDetails["servicePlans"][number],
  currency: string,
): PricingPlan {
  const features: PlanFeature[] = (plan.features ?? []).map((f) => ({
    name: f.Name,
    value: f.Value,
  }));

  const commercialModels: CommercialModel[] = [];

  for (const ep of plan.entitlementPlans ?? []) {
    const model = ep.CommercialModels ?? "";

    for (const rp of ep.ratePlans ?? []) {
      for (const br of rp.blockRates ?? []) {
        commercialModels.push({
          model,
          metric: br.MetricId,
          chargingPeriod: br.ChargingPeriod,
          pricePerUnit: `${br.PricePerBlock} ${currency}`,
          blockSize: br.BlockSize,
          includedQuantity: br.IncludedQuantity,
        });
      }
    }
  }

  return {
    planName: plan.Name,
    planCode: plan.Code,
    description: plan.Description ?? "",
    usageType: plan.UsageType ?? null,
    features,
    commercialModels,
  };
}

// ---------------------------------------------------------------------------
// Roadmap
// ---------------------------------------------------------------------------

async function fetchRoadmap(serviceId: string): Promise<ServiceRoadmap | null> {
  try {
    // Step 1: Get the roadmap reference for the service
    const roadmapRef = (await callFunctionImport(
      "GetRoadmapForService",
      { serviceId },
      roadmapCache,
    )) as { d: { results: RawServiceRoadmap[] } };

    const refs = roadmapRef.d?.results;
    if (!refs || refs.length === 0) return null;

    const roadmapId = refs[0].Roadmap;
    if (!roadmapId) return null;

    // Step 2: Fetch the full roadmap with expanded periods, categories, and deliverables
    const roadmapData = (await callEntitySet(
      `Roadmaps(${roadmapId})`,
      {
        $expand:
          "RoadmapPeriodDetails/RoadmapPeriodCategoryDetails/RoadmapDeliverableDetails",
      },
      roadmapCache,
    )) as { d: RawRoadmap };

    return formatRoadmap(roadmapData.d);
  } catch {
    // Many services have no roadmap; silently return null
    return null;
  }
}

function formatRoadmap(raw: RawRoadmap): ServiceRoadmap | null {
  if (!raw.RoadmapPeriodDetails?.results?.length) return null;

  const periods: RoadmapPeriod[] = raw.RoadmapPeriodDetails.results.map((period) => {
    const categories: RoadmapCategory[] = (
      period.RoadmapPeriodCategoryDetails?.results ?? []
    ).map((cat) => {
      const deliverables: RoadmapDeliverable[] = (
        cat.RoadmapDeliverableDetails?.results ?? []
      ).map((del) => ({
        title: del.Title,
        description: stripHtml(del.Description ?? ""),
        type: del.Type ?? "",
        tags: del.Tags ?? "",
      }));

      return {
        category: cat.Title,
        deliverables,
      };
    });

    return {
      title: period.Title,
      categories,
    };
  });

  return { periods };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
