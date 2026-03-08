export interface SearchInput {
  query: string;
  safeMode?: boolean;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}
