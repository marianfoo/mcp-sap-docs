// Opt-in live smoke test for the undocumented API used by SAP Discovery Center.

import {
  getDiscoveryCenterServiceDetails,
  searchDiscoveryCenter,
} from "../dist/src/lib/discoveryCenter/index.js";

const query = process.argv[2] || "SAP BTP ABAP environment";
const search = await searchDiscoveryCenter({ query, top: 5 });

if (search.services.length === 0) {
  throw new Error(`Discovery Center search returned no services for ${JSON.stringify(query)}`);
}

const service = search.services.find(
  (candidate) => candidate.name.toLowerCase() === query.toLowerCase(),
) ?? search.services[0];

const details = await getDiscoveryCenterServiceDetails({
  serviceId: service.id,
  currency: "EUR",
  includePricing: true,
  includeRoadmap: true,
});

if (!details.name || !details.links.discoveryCenter) {
  throw new Error("Discovery Center details response is missing core fields");
}
if (!Array.isArray(details.pricing)) {
  throw new Error("Discovery Center details response is missing pricing");
}
if (!details.roadmap?.periods.length) {
  throw new Error("Discovery Center details response is missing roadmap periods");
}

console.log(JSON.stringify({
  query,
  matchedService: { id: service.id, name: details.name },
  pricingPlans: details.pricing.length,
  roadmapPeriods: details.roadmap.periods.length,
  documentationLinks: details.resources.documentation.length,
}, null, 2));
