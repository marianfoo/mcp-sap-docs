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
    
    console.log(`✅ Metadata loaded: ${META.sources.length} sources, ${Object.keys(SYNONYM_MAP).length} synonyms`);
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
    
    return META;
  }
}

export function getSourceBoosts(): Record<string, number> {
  if (!META) loadMetadata();
  return BOOSTS;
}

export function expandQueryTerms(q: string): string[] {
  if (!META) loadMetadata();
  
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
  if (!META) loadMetadata();
  return META!;
}

// Get documentation URL configuration for a library
export function getDocUrlConfig(libraryId: string): DocUrlConfig | null {
  if (!META) loadMetadata();
  if (!META) return null;
  const source = META.sources.find(s => s.libraryId === libraryId);
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
  if (!META) loadMetadata();
  if (!META) return {};
  const configs: Record<string, DocUrlConfig> = {};
  for (const source of META.sources) {
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
  if (!META) loadMetadata();
  if (!META) return null;
  const source = META.sources.find(s => s.libraryId === libraryId);
  return source?.sourcePath || null;
}

// Get all source paths
export function getAllSourcePaths(): Record<string, string> {
  if (!META) loadMetadata();
  if (!META) return {};
  const paths: Record<string, string> = {};
  for (const source of META.sources) {
    if (source.libraryId && source.sourcePath) {
      paths[source.libraryId] = source.sourcePath;
    }
  }
  return paths;
}

// Get context boosts for a specific context
export function getContextBoosts(context: string): Record<string, number> {
  if (!META) loadMetadata();
  if (!META) return {};
  return META.contextBoosts?.[context] || {};
}

// Get all context boosts
export function getAllContextBoosts(): Record<string, Record<string, number>> {
  if (!META) loadMetadata();
  if (!META) return {};
  return META.contextBoosts || {};
}

// Get library mapping for source ID
export function getLibraryMapping(sourceId: string): string | null {
  if (!META) loadMetadata();
  if (!META) return null;
  return META.libraryMappings?.[sourceId] || null;
}

// Get all library mappings
export function getAllLibraryMappings(): Record<string, string> {
  if (!META) loadMetadata();
  if (!META) return {};
  return META.libraryMappings || {};
}

// Get context emoji
export function getContextEmoji(context: string): string {
  if (!META) loadMetadata();
  if (!META) return '🔍';
  return META.contextEmojis?.[context] || '🔍';
}

// Get all context emojis
export function getAllContextEmojis(): Record<string, string> {
  if (!META) loadMetadata();
  if (!META) return {};
  return META.contextEmojis || {};
}

// Get source by library ID
export function getSourceByLibraryId(libraryId: string): SourceMeta | null {
  if (!META) loadMetadata();
  if (!META) return null;
  return META.sources.find(s => s.libraryId === libraryId) || null;
}

// Get source by ID
export function getSourceById(id: string): SourceMeta | null {
  if (!META) loadMetadata();
  if (!META) return null;
  return META.sources.find(s => s.id === id) || null;
}
