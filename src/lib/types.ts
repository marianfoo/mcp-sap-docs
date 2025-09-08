export interface SearchResult {
  library_id: string;
  topic: string;
  id: string;
  title: string;
  url?: string;
  snippet?: string;
  score?: number;
  metadata?: Record<string, any>;
  // Legacy fields for backward compatibility
  description?: string;
  totalSnippets?: number;
  source?: string; // "docs" | "community" | "help"
  postTime?: string; // For community posts
  author?: string; // For community posts - author name
  likes?: number;  // For community posts - number of likes/kudos
  tags?: string[]; // For community posts - associated tags
}

export interface SearchResponse {
  results: SearchResult[];
  error?: string;
}

// SAP Help specific types
export interface SapHelpSearchResult {
  loio: string;
  title: string;
  url: string;
  productId?: string;
  product?: string;
  version?: string;
  versionId?: string;
  language?: string;
  snippet?: string;
}

export interface SapHelpSearchResponse {
  data?: {
    results?: SapHelpSearchResult[];
  };
}

export interface SapHelpMetadataResponse {
  data?: {
    deliverable?: {
      id: string;
      buildNo: string;
    };
    filePath?: string;
  };
}

export interface SapHelpPageContentResponse {
  data?: {
    currentPage?: {
      t?: string; // title
    };
    deliverable?: {
      title?: string;
    };
    body?: string;
  };
} 