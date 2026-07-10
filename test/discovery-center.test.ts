/**
 * Contract tests for the SAP Discovery Center REST integration.
 * No real network calls are made; fetch is stubbed with current API shapes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callDiscoveryCenterApi,
  buildCacheKey,
  detailsCache,
  roadmapCache,
  searchCache,
} from "../dist/src/lib/discoveryCenter/api.js";
import {
  getDiscoveryCenterServiceDetails,
  searchDiscoveryCenter,
} from "../dist/src/lib/discoveryCenter/index.js";

const SERVICE_ID = "0ad55771-a533-4d25-a4dd-e3d8b1ffa4f6";

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function serviceSearchResult(overrides: Record<string, unknown> = {}) {
  return {
    id: SERVICE_ID,
    name: "SAP BTP ABAP environment",
    shortName: "abap-environment",
    shortDesc: "Build cloud applications with ABAP.",
    category: "Application Development and Automation",
    additionalCategories: "Cloud ERP",
    licenseModelType: "btpea,payg,trial",
    provider: "SAP",
    tags: "ABAP,Free Tier",
    ribbon: "",
    isDeprecatedService: false,
    ...overrides,
  };
}

function serviceDetails(overrides: Record<string, unknown> = {}) {
  return {
    AdditionalCategories: "Cloud ERP",
    CalculatorLink: "https://example.test/calculator",
    Category: "Application Development and Automation",
    CsnComponent: "BC-CP-ABA",
    FeatureDescLink: "https://example.test/features",
    Icon: "icon.svg",
    Id: SERVICE_ID,
    LicenseModelType: "btpea,payg,trial",
    LongDescription: "Long ABAP environment description.",
    MaterialId: "material-1",
    Name: "SAP BTP ABAP environment",
    ParentService: null,
    PricingExample: null,
    ProductId: "product-1",
    ProductType: "Service",
    ReferencedTools: "",
    SapStoreLink: "https://example.test/store",
    ServiceJiraId: "jira-1",
    ShortDescription: "Short ABAP environment description.",
    ShortName: "abap-environment",
    Tags: "ABAP,Free Tier",
    IsDeprecatedService: false,
    resources: [
      {
        FileName: "Documentation",
        FileType: "LINK",
        FolderType: "Service Information on help.sap.com",
        Id: 1,
        Location: "https://help.sap.com/abap-environment",
        RowOrder: 1,
        ShortDescription: null,
      },
      {
        FileName: "Tutorial",
        FileType: "LINK",
        FolderType: "Tutorial",
        Id: 2,
        Location: "https://developers.sap.com/abap-environment",
        RowOrder: 2,
        ShortDescription: null,
      },
      {
        FileName: "Internal",
        FileType: "LINK",
        FolderType: "General",
        Id: 3,
        Location: "https://example.test/internal",
        RowOrder: 3,
        ShortDescription: null,
      },
    ],
    certifications: [],
    headlines: [
      { Headline: "Second", Description: "Second headline", RowOrder: 2 },
      { Headline: "First", Description: "First headline", RowOrder: 1 },
    ],
    metrics: [
      { Id: 1, Name: "Capacity Unit", Description: "Consumed capacity.", Code: "cu" },
    ],
    servicePlans: [
      {
        Code: "standard",
        Description: "Standard plan",
        UsageType: "paid",
        Id: "plan-1",
        Name: "Standard",
        ServicePlanOrder: 1,
        features: [
          {
            Id: 1,
            MoreInfoLink: null,
            MoreInfoName: null,
            Name: "Availability",
            Quantity: "1",
            Value: "Included",
          },
        ],
        environments: [],
        IncludedServices: [],
        RequiredServices: [],
        entitlementPlans: [
          {
            CommercialModels: "payg",
            DirectBillingRelationship: "",
            External: false,
            Id: "entitlement-1",
            TechAssetVariantsString: "",
            UsageType: "paid",
            environments: [],
            materials: [],
            IncludedServiceMetadata: [],
            ratePlans: [
              {
                Id: "rate-1",
                Currency: "EUR",
                ValidFrom: "2026-01-01",
                ValidTo: "2026-12-31",
                allUnitVolumes: [],
                blockRates: [
                  {
                    Id: "block-1",
                    BlockSize: "1",
                    ChargingPeriod: "monthly",
                    MetricId: "cu",
                    PricePerBlock: "1.04",
                    IncludedQuantity: "0",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function roadmap() {
  return {
    id: 9999,
    productId: "product-1",
    periods: [
      {
        id: 1,
        title: "Q4 2026",
        releasedVersions: null,
        categories: [
          {
            id: 2,
            title: "Developer Experience",
            deliverables: [
              {
                id: 3,
                deliveryId: "delivery-1",
                title: "New tooling",
                type: "PLANNED",
                serviceId: SERVICE_ID,
                description: "<p>Faster &amp; simpler&nbsp;tooling.</p>",
                deliveryStatus: null,
                tags: "ABAP,Tooling",
              },
            ],
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  searchCache.clear();
  detailsCache.clear();
  roadmapCache.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Discovery Center REST client", () => {
  it("builds deterministic cache keys and caches successful JSON responses", async () => {
    expect(buildCacheKey("/search/services", { top: 5, q: "ABAP" })).toBe(
      buildCacheKey("/search/services", { q: "ABAP", top: 5 }),
    );
    expect(buildCacheKey("/search/services", { q: "ABAP&top=5" })).not.toBe(
      buildCacheKey("/search/services", { q: "ABAP", top: 5 }),
    );

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: "one" }]));
    vi.stubGlobal("fetch", fetchMock);

    const first = await callDiscoveryCenterApi("/test/cache", { q: "A&B" });
    const second = await callDiscoveryCenterApi("/test/cache", { q: "A&B" });

    expect(first).toEqual([{ id: "one" }]);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    const url = new URL(String(requestUrl));
    expect(url.pathname).toBe("/servicecatalog/api/v1/test/cache");
    expect(url.searchParams.get("q")).toBe("A&B");
    expect(requestInit.headers).toMatchObject({
      Accept: "application/json",
      "sap-language": "en",
    });
  });

  it("reports non-JSON responses instead of caching them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json")));

    await expect(callDiscoveryCenterApi("/bad-json")).rejects.toThrow(
      "Discovery Center API returned invalid JSON for /bad-json",
    );
  });
});

describe("searchDiscoveryCenter", () => {
  it("uses the REST search route and maps lower-camel-case fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([
      serviceSearchResult(),
      serviceSearchResult({ id: "second", name: "Second service" }),
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchDiscoveryCenter({ query: "SAP Build & AI", top: 1 });

    expect(result).toEqual({
      total: 1,
      services: [
        expect.objectContaining({
          id: SERVICE_ID,
          name: "SAP BTP ABAP environment",
          description: "Build cloud applications with ABAP.",
          isDeprecated: false,
        }),
      ],
    });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/servicecatalog/api/v1/search/services");
    expect(url.searchParams.get("q")).toBe("SAP Build & AI");
    expect(url.searchParams.get("top")).toBe("1");
  });

  it("retains category and free-tier client-side filters", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([
      serviceSearchResult(),
      serviceSearchResult({
        id: "integration",
        name: "Integration service",
        category: "Integration",
        licenseModelType: "subscription",
        tags: "Integration",
      }),
    ])));

    const result = await searchDiscoveryCenter({
      query: "service",
      top: 2,
      category: "Application Development",
      licenseModel: "free",
    });

    expect(result.services.map((service) => service.id)).toEqual([SERVICE_ID]);
  });

  it("rejects search entries without required fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([{ id: SERVICE_ID }])));

    await expect(searchDiscoveryCenter({ query: "broken" })).rejects.toThrow(
      "Discovery Center API returned a search result without required fields",
    );
  });
});

describe("getDiscoveryCenterServiceDetails", () => {
  it("maps details, pricing, resources, and the two-step roadmap response", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith(`/services/${SERVICE_ID}`)) {
        expect(url.searchParams.get("currency")).toBe("EUR");
        return jsonResponse(serviceDetails());
      }
      if (url.pathname.endsWith(`/roadmaps/by-service/${SERVICE_ID}`)) {
        return jsonResponse([{ id: SERVICE_ID, name: "ABAP", roadmap: { id: 9999 } }]);
      }
      if (url.pathname.endsWith("/roadmaps/9999")) {
        return jsonResponse(roadmap());
      }
      return new Response("not found", { status: 404, statusText: "Not Found" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getDiscoveryCenterServiceDetails({
      serviceId: SERVICE_ID,
      currency: "EUR",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.name).toBe("SAP BTP ABAP environment");
    expect(result.headlines.map((headline) => headline.headline)).toEqual(["First", "Second"]);
    expect(result.resources.documentation).toEqual([
      { title: "Documentation", url: "https://help.sap.com/abap-environment" },
    ]);
    expect(result.resources.tutorials).toHaveLength(1);
    expect(result.resources.community).toEqual([]);
    expect(result.pricing?.[0].commercialModels[0]).toEqual(
      expect.objectContaining({ pricePerUnit: "1.04 EUR", metric: "cu" }),
    );
    expect(result.roadmap).toEqual({
      periods: [
        {
          title: "Q4 2026",
          categories: [
            {
              category: "Developer Experience",
              deliverables: [
                expect.objectContaining({
                  title: "New tooling",
                  description: "Faster & simpler tooling.",
                }),
              ],
            },
          ],
        },
      ],
    });
  });

  it("resolves service names through REST search and honors optional sections", async () => {
    const exactId = "c4e4c32e-4eda-4286-96b0-5299d6a79014";
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search/services")) {
        return jsonResponse([
          serviceSearchResult({ id: "first", name: "HANA related" }),
          serviceSearchResult({ id: exactId, name: "SAP HANA Cloud", shortName: "hana-cloud" }),
        ]);
      }
      if (url.pathname.endsWith(`/services/${exactId}`)) {
        return jsonResponse(serviceDetails({ Id: exactId, Name: "SAP HANA Cloud" }));
      }
      return new Response("not found", { status: 404, statusText: "Not Found" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getDiscoveryCenterServiceDetails({
      serviceId: "SAP HANA Cloud",
      includePricing: false,
      includeRoadmap: false,
    });

    expect(result.name).toBe("SAP HANA Cloud");
    expect(result.pricing).toBeNull();
    expect(result.roadmap).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const searchUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(searchUrl.searchParams.get("q")).toBe("SAP HANA Cloud");
  });

  it("returns null for a service with no roadmap", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/roadmaps/by-service/")) return jsonResponse([]);
      return jsonResponse(serviceDetails());
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getDiscoveryCenterServiceDetails({ serviceId: SERVICE_ID });

    expect(result.roadmap).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a successful empty details response as not found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));

    await expect(getDiscoveryCenterServiceDetails({ serviceId: SERVICE_ID })).rejects.toThrow(
      `Service not found: ${SERVICE_ID}`,
    );
  });

  it("does not hide genuine roadmap API failures", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/roadmaps/by-service/")) {
        return new Response("upstream unavailable", {
          status: 503,
          statusText: "Service Unavailable",
        });
      }
      return jsonResponse(serviceDetails());
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getDiscoveryCenterServiceDetails({ serviceId: SERVICE_ID })).rejects.toThrow(
      "Discovery Center API error: 503 Service Unavailable",
    );
  });

  it("rejects a malformed roadmap reference instead of treating it as absent", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/roadmaps/by-service/")) {
        return jsonResponse([{ id: SERVICE_ID, name: "ABAP", roadmap: {} }]);
      }
      return jsonResponse(serviceDetails());
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getDiscoveryCenterServiceDetails({ serviceId: SERVICE_ID })).rejects.toThrow(
      "Discovery Center API returned a roadmap reference without an ID",
    );
  });
});
