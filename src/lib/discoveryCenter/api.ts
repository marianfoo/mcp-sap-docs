// SAP Discovery Center OData V2 client
// Public API at https://discovery-center.cloud.sap/servicecatalog/ (no auth required)

import { CONFIG } from "../config.js";
import { TtlCache } from "../softwareHeroes/core.js";

const BASE_URL = "https://discovery-center.cloud.sap/servicecatalog";

// Separate caches for different data types with different staleness characteristics
const searchCache = new TtlCache<unknown>(CONFIG.DISCOVERY_CENTER_CACHE_TTL_MS);
const detailsCache = new TtlCache<unknown>(CONFIG.DISCOVERY_CENTER_CACHE_TTL_MS);
const roadmapCache = new TtlCache<unknown>(CONFIG.DISCOVERY_CENTER_CACHE_TTL_MS * 4); // 4h for roadmaps

function buildCacheKey(path: string, params: Record<string, string>): string {
  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `${path}|${sortedParams}`;
}

/**
 * Call a Discovery Center OData function import.
 * Parameters are passed as OData-style single-quoted values.
 */
export async function callFunctionImport(
  functionImport: string,
  params: Record<string, string> = {},
  cache?: TtlCache<unknown>,
): Promise<unknown> {
  const cacheKey = buildCacheKey(functionImport, params);
  const cacheToUse = cache ?? detailsCache;

  const cached = cacheToUse.get(cacheKey);
  if (cached !== undefined) return cached;

  // OData V2 function import params use single-quoted string values.
  // Values must NOT be URI-encoded inside the quotes (the API rejects encoded values).
  const queryParts = Object.entries(params).map(
    ([key, value]) => `${key}='${value}'`,
  );
  queryParts.push("$format=json");

  const url = `${BASE_URL}/${functionImport}?${queryParts.join("&")}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.DISCOVERY_CENTER_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Discovery Center API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    cacheToUse.set(cacheKey, json);
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Call an OData entity set or entity with $expand.
 */
export async function callEntitySet(
  path: string,
  params: Record<string, string> = {},
  cache?: TtlCache<unknown>,
): Promise<unknown> {
  const cacheKey = buildCacheKey(path, params);
  const cacheToUse = cache ?? detailsCache;

  const cached = cacheToUse.get(cacheKey);
  if (cached !== undefined) return cached;

  const queryParts = Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  queryParts.push("$format=json");

  const url = `${BASE_URL}/${path}?${queryParts.join("&")}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.DISCOVERY_CENTER_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Discovery Center API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    cacheToUse.set(cacheKey, json);
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

export { searchCache, detailsCache, roadmapCache };
