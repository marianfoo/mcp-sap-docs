// SAP Discovery Center REST API client
// The current Discovery Center UI uses /servicecatalog/api/v1 without authentication.

import { CONFIG } from "../config.js";
import { TtlCache } from "../softwareHeroes/core.js";

const BASE_URL = "https://discovery-center.cloud.sap/servicecatalog/api/v1";

type QueryParam = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryParam>;

// Separate caches for different data types with different staleness characteristics
const searchCache = new TtlCache<unknown>(CONFIG.DISCOVERY_CENTER_CACHE_TTL_MS);
const detailsCache = new TtlCache<unknown>(CONFIG.DISCOVERY_CENTER_CACHE_TTL_MS);
const roadmapCache = new TtlCache<unknown>(CONFIG.DISCOVERY_CENTER_CACHE_TTL_MS * 4); // 4h for roadmaps

function normalizedParams(params: QueryParams): [string, string][] {
  return Object.entries(params)
    .filter((entry): entry is [string, Exclude<QueryParam, null | undefined>] =>
      entry[1] !== null && entry[1] !== undefined
    )
    .map(([key, value]): [string, string] => [key, String(value)])
    .sort(([a], [b]) => a.localeCompare(b));
}

function buildCacheKey(path: string, params: QueryParams): string {
  const query = normalizedParams(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return `${path}|${query}`;
}

export class DiscoveryCenterApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly responseBody: string,
  ) {
    super(`Discovery Center API error: ${status} ${statusText}`.trim());
    this.name = "DiscoveryCenterApiError";
  }
}

/**
 * Call a Discovery Center REST endpoint and cache its JSON response.
 *
 * The API returns HTTP 200 with an empty body for some missing resources, so
 * callers must validate null responses according to their domain semantics.
 */
export async function callDiscoveryCenterApi<T>(
  path: string,
  params: QueryParams = {},
  cache?: TtlCache<unknown>,
): Promise<T | null> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const cacheKey = buildCacheKey(normalizedPath, params);
  const cacheToUse = cache ?? detailsCache;

  const cached = cacheToUse.get(cacheKey);
  if (cached !== undefined) return cached as T | null;

  const url = new URL(`${BASE_URL}${normalizedPath}`);
  for (const [key, value] of normalizedParams(params)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.DISCOVERY_CENTER_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "sap-language": "en",
      },
    });

    const body = await response.text();
    if (!response.ok) {
      throw new DiscoveryCenterApiError(response.status, response.statusText, body);
    }

    if (!body.trim()) {
      cacheToUse.set(cacheKey, null);
      return null;
    }

    let json: T;
    try {
      json = JSON.parse(body) as T;
    } catch {
      throw new Error(`Discovery Center API returned invalid JSON for ${normalizedPath}`);
    }

    cacheToUse.set(cacheKey, json);
    return json;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Discovery Center API timeout after ${CONFIG.DISCOVERY_CENTER_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export { buildCacheKey, searchCache, detailsCache, roadmapCache };
