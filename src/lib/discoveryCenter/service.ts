// SAP Discovery Center service details with pricing and roadmap

import { callDiscoveryCenterApi, searchCache, detailsCache, roadmapCache } from "./api.js";
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
  const raw = await callDiscoveryCenterApi<RawServiceEntity[]>(
    "/search/services",
    { q: nameOrId, top: 5 },
    searchCache,
  );

  if (!Array.isArray(raw)) {
    throw new Error("Discovery Center API returned an invalid search response");
  }

  if (raw.length === 0) {
    throw new Error(`No service found matching "${nameOrId}". Use sap_discovery_center_search to find the correct service name or ID.`);
  }

  // Prefer exact name match (case-insensitive)
  const lower = nameOrId.toLowerCase();
  const exact = raw.find(
    (s) => s.name?.toLowerCase() === lower || s.shortName?.toLowerCase() === lower,
  );

  const serviceId = exact?.id ?? raw[0]?.id;
  if (!serviceId) {
    throw new Error("Discovery Center API returned a search result without a service ID");
  }

  return serviceId;
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
  const details = await callDiscoveryCenterApi<RawServiceDetails>(
    `/services/${encodeURIComponent(serviceId)}`,
    { currency },
    detailsCache,
  );

  if (!details?.Id) {
    throw new Error(`Service not found: ${options.serviceId}`);
  }

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
          pricePerUnit: `${br.PricePerBlock} ${rp.Currency || currency}`,
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
  // The current UI first resolves the service to a roadmap ID, then fetches
  // the canonical roadmap resource. Services without a roadmap return [].
  const refs = await callDiscoveryCenterApi<RawServiceRoadmap[]>(
    `/roadmaps/by-service/${encodeURIComponent(serviceId)}`,
    {},
    roadmapCache,
  );

  if (!Array.isArray(refs)) {
    throw new Error("Discovery Center API returned an invalid roadmap response");
  }

  if (refs.length === 0) return null;

  const roadmapId = refs[0]?.roadmap?.id;
  if (typeof roadmapId !== "number" || !Number.isFinite(roadmapId)) {
    throw new Error("Discovery Center API returned a roadmap reference without an ID");
  }

  const roadmap = await callDiscoveryCenterApi<RawRoadmap>(
    `/roadmaps/${encodeURIComponent(String(roadmapId))}`,
    {},
    roadmapCache,
  );

  if (!roadmap || !Array.isArray(roadmap.periods)) {
    throw new Error("Discovery Center API returned an invalid roadmap response");
  }

  return formatRoadmap(roadmap);
}

function formatRoadmap(raw: RawRoadmap): ServiceRoadmap | null {
  if (!raw.periods?.length) return null;

  const periods: RoadmapPeriod[] = raw.periods.map((period) => {
    const categories: RoadmapCategory[] = (period.categories ?? []).map((cat) => {
      const deliverables: RoadmapDeliverable[] = (cat.deliverables ?? []).map((del) => ({
        title: del.title,
        description: stripHtml(del.description ?? ""),
        type: del.type ?? "",
        tags: del.tags ?? "",
      }));

      return {
        category: cat.title,
        deliverables,
      };
    });

    return {
      title: period.title,
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
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
