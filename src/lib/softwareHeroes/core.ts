// Software Heroes API client with in-memory TTL cache
// Provides HTTP client for software-heroes.com API with timeout and caching

import { CONFIG } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SoftwareHeroesApiOptions {
  /** Client identifier sent in headers (default: from env or "ABAPMCPSERVER") */
  client?: string;
  /** Request timeout in milliseconds (default: from env or 10000) */
  timeoutMs?: number;
}

/** Screen item returned by some API methods (e.g., START_SEARCH) */
export interface SoftwareHeroesScreenItem {
  /** Element ID (e.g., "id_search_out") */
  id: string;
  /** HTML content */
  content: string;
  /** Action type (e.g., "SET") */
  action?: string;
}

/**
 * Single search result item returned by START_SEARCH_JSON.
 * Using this method avoids the need to parse HTML from START_SEARCH.
 */
export interface SoftwareHeroesSearchJsonItem {
  /** Content type: "B" = blog/article, "P" = page */
  TYPE: "B" | "P" | string;
  /** Title of the result */
  HEAD: string;
  /** Snippet text (may contain HTML entities like &amp; but no HTML tags) */
  TEXT: string;
  /** Relative URL path (e.g., "/en/blog/slug") or numeric page ID (e.g., "1768") */
  LINK: string;
  /** Publication date (YYYY-MM-DD) */
  DATE: string;
  /** Publication time (HH:MM:SS) */
  TIME: string;
}

export interface SoftwareHeroesApiResponse {
  status: boolean;
  msg: string;
  icon?: string;
  /** String payload for plain methods; structured array for START_SEARCH_JSON */
  data?: string | SoftwareHeroesSearchJsonItem[];
  content?: string;
  /** Screen items returned by methods like START_SEARCH (HTML-based, legacy) */
  screen?: SoftwareHeroesScreenItem[];
}

// ---------------------------------------------------------------------------
// In-memory TTL Cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple in-memory TTL cache.
 * Cache is process-local and resets on server restart/deploy.
 */
export class TtlCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number) {
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    if (Date.now() > entry.expiresAt) {
      // Entry expired, remove it
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.cache.set(key, { value, expiresAt });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  /** Returns number of non-expired entries */
  size(): number {
    let count = 0;
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt > now) {
        count++;
      } else {
        // Clean up expired entries opportunistically
        this.cache.delete(key);
      }
    }
    return count;
  }
}

// ---------------------------------------------------------------------------
// Global cache instance (24h TTL by default)
// ---------------------------------------------------------------------------

/** Cache for Software Heroes API responses (keyed by request params) */
export const softwareHeroesCache = new TtlCache<SoftwareHeroesApiResponse>(
  CONFIG.SOFTWARE_HEROES_CACHE_TTL_MS
);

// ---------------------------------------------------------------------------
// Shared HTML Parsing Utilities
// ---------------------------------------------------------------------------

/** Decode HTML entities (comprehensive: standard, German umlauts, smart quotes, numeric) */
export const decodeEntities = (s = ""): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ouml;/g, "ö")
    .replace(/&auml;/g, "ä")
    .replace(/&uuml;/g, "ü")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&#\d+;/g, (match) => {
      const code = parseInt(match.slice(2, -1), 10);
      return String.fromCharCode(code);
    });

/** Strip HTML tags and clean whitespace */
export const stripTags = (html = ""): string =>
  decodeEntities(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const API_BASE = "https://software-heroes.com/api/core";

/**
 * Build cache key from request parameters
 */
export function buildCacheKey(
  method: string,
  dataParams: Record<string, string>
): string {
  // Sort keys for consistent cache keys
  const sortedKeys = Object.keys(dataParams).sort();
  const parts = sortedKeys.map(k => `${k}=${dataParams[k]}`);
  return `${method}|${parts.join("|")}`;
}

/**
 * Make a POST request to the Software Heroes API
 * 
 * @param method - API method (e.g., "CUST_API")
 * @param dataParams - JSON data parameters to send
 * @param options - Client and timeout options
 * @returns API response
 */
export async function callSoftwareHeroesApi(
  method: string,
  dataParams: Record<string, string>,
  options: SoftwareHeroesApiOptions = {}
): Promise<SoftwareHeroesApiResponse> {
  const client = options.client || CONFIG.SOFTWARE_HEROES_CLIENT;
  const timeoutMs = options.timeoutMs || CONFIG.SOFTWARE_HEROES_TIMEOUT_MS;

  // Check cache first
  const cacheKey = buildCacheKey(method, dataParams);
  const cachedResponse = softwareHeroesCache.get(cacheKey);
  if (cachedResponse) {
    console.log(`📦 [SoftwareHeroes] Cache hit for key: ${cacheKey.substring(0, 60)}...`);
    return cachedResponse;
  }

  console.log(`🌐 [SoftwareHeroes] Fetching from API (cache miss): ${cacheKey.substring(0, 60)}...`);

  // Build form body
  const formBody = new URLSearchParams();
  formBody.set("meth", method);
  formBody.set("data", JSON.stringify(dataParams));

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(API_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        // Set client identifier in multiple headers for maximum compatibility
        "User-Agent": client,
        "X-Client": client,
      },
      body: formBody.toString(),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Software Heroes API error: ${response.status} ${response.statusText}`);
    }

    const data: SoftwareHeroesApiResponse = await response.json();

    // Cache successful responses
    if (data.status) {
      softwareHeroesCache.set(cacheKey, data);
      console.log(`✅ [SoftwareHeroes] Cached response (TTL: ${CONFIG.SOFTWARE_HEROES_CACHE_TTL_MS / 1000 / 60 / 60}h)`);
    }

    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      throw new Error(`Software Heroes API timeout after ${timeoutMs}ms`);
    }

    throw new Error(`Software Heroes API request failed: ${error.message}`);
  }
}

/**
 * Get cache statistics for debugging/monitoring
 */
export function getCacheStats(): { size: number; ttlHours: number } {
  return {
    size: softwareHeroesCache.size(),
    ttlHours: CONFIG.SOFTWARE_HEROES_CACHE_TTL_MS / 1000 / 60 / 60,
  };
}

