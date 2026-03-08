export interface SearchRequest {
  query: string;
  safeMode?: boolean;
}

export interface SearchResultItem {
  id: string;
  title: string;
  url: string;
  description: string;
  displayUrl?: string;
}

export interface SearchResponse {
  query: string;
  safeModeApplied: boolean;
  summary: string | null;
  sources: Array<{ title: string; url: string }>;
  results: SearchResultItem[];
}
