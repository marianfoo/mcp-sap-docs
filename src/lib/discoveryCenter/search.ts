// SAP Discovery Center search

import { callFunctionImport, searchCache } from "./api.js";
import type {
  DiscoveryCenterSearchOptions,
  DiscoveryCenterSearchResponse,
  DiscoveryCenterSearchResult,
  RawServiceEntity,
} from "./types.js";

/**
 * Search SAP BTP services in the Discovery Center catalog.
 * Calls GetSearchedServices and applies optional client-side filters for category and license model.
 */
export async function searchDiscoveryCenter(
  options: DiscoveryCenterSearchOptions,
): Promise<DiscoveryCenterSearchResponse> {
  const { query, top = 10, category, licenseModel } = options;

  const clampedTop = Math.min(Math.max(top, 1), 25);

  // Fetch more if we need to filter client-side
  const fetchTop = category || licenseModel ? String(Math.min(clampedTop * 3, 50)) : String(clampedTop);

  const raw = (await callFunctionImport(
    "GetSearchedServices",
    {
      searchString: query,
      top: fetchTop,
    },
    searchCache,
  )) as { d: { results: RawServiceEntity[] } };

  let results = raw.d.results;

  // Client-side filtering (the API doesn't support these as parameters)
  if (category) {
    const lower = category.toLowerCase();
    results = results.filter(
      (s) =>
        s.Category?.toLowerCase().includes(lower) ||
        s.AdditionalCategories?.toLowerCase().includes(lower),
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
      const models = s.LicenseModelType?.toLowerCase() ?? "";
      if (licenseModel === "free") {
        return (
          models.includes("trial") ||
          s.Tags?.toLowerCase().includes("free tier")
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
    id: raw.Id,
    name: raw.Name,
    shortName: raw.ShortName,
    description: raw.ShortDesc,
    category: raw.Category ?? "",
    additionalCategories: raw.AdditionalCategories ?? "",
    licenseModelType: raw.LicenseModelType ?? "",
    provider: raw.Provider ?? "",
    tags: raw.Tags ?? "",
    ribbon: raw.Ribbon ?? "",
    isDeprecated: raw.IsDeprecatedService ?? false,
  };
}
