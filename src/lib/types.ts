export interface SearchResult {
  id: string;
  title: string;
  description: string;
  totalSnippets: number;
  source?: string; // "docs" | "community" | "help"
  url?: string;    // For community posts or help pages
  postTime?: string; // For community posts
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