export type SafeSearchLevel = 'off' | 'moderate' | 'strict';

export interface WebSearchRequest {
  query: string;
  count?: number | undefined;
  offset?: number | undefined;
  country?: string | undefined;
  searchLang?: string | undefined;
  safeSearch?: SafeSearchLevel | undefined;
}

export interface NormalizedSearchResult {
  id: string;
  title: string;
  url: string;
  displayUrl?: string | undefined;
  description: string;
  source: 'brave';
  language?: string | undefined;
  publishedAt?: string | undefined;
  age?: string | undefined;
  score?: number | undefined;
}

export interface WebSearchResponse {
  query: string;
  totalEstimatedMatches?: number | undefined;
  nextOffset?: number | undefined;
  results: NormalizedSearchResult[];
}

export interface WebSearchProvider {
  search(request: WebSearchRequest): Promise<WebSearchResponse>;
}
