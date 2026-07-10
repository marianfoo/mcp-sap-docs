// SAP Discovery Center search

import { callDiscoveryCenterApi, searchCache } from "./api.js";
import type {
  DiscoveryCenterSearchOptions,
  DiscoveryCenterSearchResponse,
  DiscoveryCenterSearchResult,
  RawServiceEntity,
} from "./types.js";

/**
 * Search SAP BTP services in the Discovery Center catalog.
 * Calls the Discovery Center REST search and applies optional client-side filters
 * for category and license model.
 */
export async function searchDiscoveryCenter(
  options: DiscoveryCenterSearchOptions,
): Promise<DiscoveryCenterSearchResponse> {
  const { query, top = 10, category, licenseModel } = options;

  const clampedTop = Math.min(Math.max(top, 1), 25);

  // Fetch more if we need to filter client-side
  const fetchTop = category || licenseModel ? String(Math.min(clampedTop * 3, 50)) : String(clampedTop);

  const raw = await callDiscoveryCenterApi<RawServiceEntity[]>(
    "/search/services",
    {
      q: query,
      top: fetchTop,
    },
    searchCache,
  );

  if (!Array.isArray(raw)) {
    throw new Error("Discovery Center API returned an invalid search response");
  }
  if (raw.some((service) => !service?.id || !service.name)) {
    throw new Error("Discovery Center API returned a search result without required fields");
  }

  let results = raw;

  // Client-side filtering (the API doesn't support these as parameters)
  if (category) {
    const lower = category.toLowerCase();
    results = results.filter(
      (s) =>
        s.category?.toLowerCase().includes(lower) ||
        s.additionalCategories?.toLowerCase().includes(lower),
    );
  }

  if (licenseModel) {
    const modelMap: Record<string, string> = {
      free: "trial",
      payg: "payg",
      subscription: "subscription",
      btpea: "btpea",
      cloudcredits: "cloudcredits",
    };
    const mapped = modelMap[licenseModel] ?? licenseModel;
    results = results.filter((s) => {
      const models = s.licenseModelType?.toLowerCase() ?? "";
      if (licenseModel === "free") {
        return (
          models.includes("trial") ||
          s.tags?.toLowerCase().includes("free tier")
        );
      }
      return models.includes(mapped);
    });
  }

  // Trim to requested count
  results = results.slice(0, clampedTop);

  const services: DiscoveryCenterSearchResult[] = results.map(mapServiceEntity);

  return { services, total: services.length };
}

function mapServiceEntity(raw: RawServiceEntity): DiscoveryCenterSearchResult {
  return {
    id: raw.id,
    name: raw.name,
    shortName: raw.shortName ?? "",
    description: raw.shortDesc ?? "",
    category: raw.category ?? "",
    additionalCategories: raw.additionalCategories ?? "",
    licenseModelType: raw.licenseModelType ?? "",
    provider: raw.provider ?? "",
    tags: raw.tags ?? "",
    ribbon: raw.ribbon ?? "",
    isDeprecated: raw.isDeprecatedService ?? false,
  };
}
