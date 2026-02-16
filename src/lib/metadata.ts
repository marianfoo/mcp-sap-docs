// Metadata and configuration management
import fs from "fs";
import path from "path";
import { CONFIG } from "./config.js";

export type SourceMeta = {
  id: string;
  type: string;
  lang?: string;
  boost?: number;
  tags?: string[];
  description?: string;
  libraryId?: string;
  sourcePath?: string;
  baseUrl?: string;
  pathPattern?: string;
  anchorStyle?: 'docsify' | 'github' | 'custom';
};

export type DocUrlConfig = {
  baseUrl: string;
  pathPattern: string;
  anchorStyle: 'docsify' | 'github' | 'custom';
};

export type Metadata = {
  version: number;
  updated_at: string;
  description?: string;
  sources: SourceMeta[];
  acronyms?: Record<string, string[]>;
  synonyms?: Array<{ from: string; to: string[] }>;
  contextBoosts?: Record<string, Record<string, number>>;
  libraryMappings?: Record<string, string>;
  contextEmojis?: Record<string, string>;
};

let META: Metadata | null = null;
let BOOSTS: Record<string, number> = {};
let SYNONYM_MAP: Record<string, string[]> = {};
// Normalized context boosts with lowercase keys for case-insensitive lookup
let CONTEXT_BOOSTS_NORMALIZED: Record<string, Record<string, number>> = {};

/** Ensure metadata is loaded (lazy init guard used by all accessor functions) */
function ensureLoaded(): Metadata {
  if (!META) loadMetadata();
  return META!;
}

export function loadMetadata(metaPath?: string): Metadata {
  if (META) return META;
  
  const finalPath = metaPath || path.resolve(process.cwd(), CONFIG.METADATA_PATH);
  
  try {
    const raw = fs.readFileSync(finalPath, "utf8");
    META = JSON.parse(raw) as Metadata;
    
    // Build source boosts map
    BOOSTS = Object.fromEntries(
      (META.sources || []).map(s => [s.id, s.boost || 0])
    );
    
    // Build synonym map (including acronyms)
    const syn: Record<string, string[]> = {};
    for (const [k, arr] of Object.entries(META.acronyms || {})) {
      syn[k.toLowerCase()] = arr;
    }
    for (const s of META.synonyms || []) {
      syn[s.from.toLowerCase()] = s.to;
    }
    SYNONYM_MAP = syn;
    
    // Normalize context boosts keys to lowercase for case-insensitive lookup
    // This fixes the mismatch where metadata.json has "RAP" but search.ts uses "rap"
    CONTEXT_BOOSTS_NORMALIZED = {};
    if (META.contextBoosts) {
      for (const [ctx, boosts] of Object.entries(META.contextBoosts)) {
        CONTEXT_BOOSTS_NORMALIZED[ctx.toLowerCase()] = boosts;
      }
    }
    
    console.log(`✅ Metadata loaded: ${META.sources.length} sources, ${Object.keys(SYNONYM_MAP).length} synonyms, ${Object.keys(CONTEXT_BOOSTS_NORMALIZED).length} context boosts`);
    return META;
  } catch (error) {
    console.warn(`⚠️ Could not load metadata from ${finalPath}, using defaults:`, error);
    
    // Fallback to minimal defaults
    META = {
      version: 1,
      updated_at: new Date().toISOString(),
      sources: [],
      synonyms: [],
      acronyms: {}
    };
    
    BOOSTS = {};
    SYNONYM_MAP = {};
    CONTEXT_BOOSTS_NORMALIZED = {};
    
    return META;
  }
}

export function getSourceBoosts(): Record<string, number> {
  ensureLoaded();
  return BOOSTS;
}

export function expandQueryTerms(q: string): string[] {
  ensureLoaded();
  
  const terms = new Set<string>();
  const low = q.toLowerCase();
  terms.add(q);
  
  // Apply synonyms and acronyms
  for (const [from, toList] of Object.entries(SYNONYM_MAP)) {
    if (low.includes(from)) {
      for (const t of toList) {
        terms.add(q.replace(new RegExp(from, "ig"), t));
      }
    }
  }
  
  return Array.from(terms);
}

export function getMetadata(): Metadata {
  return ensureLoaded();
}

// Get documentation URL configuration for a library
export function getDocUrlConfig(libraryId: string): DocUrlConfig | null {
  const meta = ensureLoaded();
  const source = meta.sources.find(s => s.libraryId === libraryId);
  if (!source || !source.baseUrl || !source.pathPattern || !source.anchorStyle) {
    return null;
  }
  return {
    baseUrl: source.baseUrl,
    pathPattern: source.pathPattern,
    anchorStyle: source.anchorStyle
  };
}

// Get all documentation URL configurations
export function getAllDocUrlConfigs(): Record<string, DocUrlConfig> {
  const meta = ensureLoaded();
  const configs: Record<string, DocUrlConfig> = {};
  for (const source of meta.sources) {
    if (source.libraryId && source.baseUrl && source.pathPattern && source.anchorStyle) {
      configs[source.libraryId] = {
        baseUrl: source.baseUrl,
        pathPattern: source.pathPattern,
        anchorStyle: source.anchorStyle
      };
    }
  }
  return configs;
}

// Get source path for a library
export function getSourcePath(libraryId: string): string | null {
  const meta = ensureLoaded();
  const source = meta.sources.find(s => s.libraryId === libraryId);
  return source?.sourcePath || null;
}

// Get context boosts for a specific context (case-insensitive)
export function getContextBoosts(context: string): Record<string, number> {
  ensureLoaded();
  // Use normalized (lowercase) lookup for case-insensitive matching
  return CONTEXT_BOOSTS_NORMALIZED[context.toLowerCase()] || {};
}

// Get all context boosts (normalized to lowercase keys)
export function getAllContextBoosts(): Record<string, Record<string, number>> {
  ensureLoaded();
  return CONTEXT_BOOSTS_NORMALIZED;
}

// Get context emoji
export function getContextEmoji(context: string): string {
  const meta = ensureLoaded();
  return meta.contextEmojis?.[context] || '🔍';
}

// Get all context emojis
export function getAllContextEmojis(): Record<string, string> {
  const meta = ensureLoaded();
  return meta.contextEmojis || {};
}
