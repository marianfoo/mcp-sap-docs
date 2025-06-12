export interface SearchResult {
  id: string;
  title: string;
  description: string;
  totalSnippets: number;
  source?: string; // "docs" | "community" 
  url?: string;    // For community posts
  postTime?: string; // For community posts
}

export interface SearchResponse {
  results: SearchResult[];
  error?: string;
} 