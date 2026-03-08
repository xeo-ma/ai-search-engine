import { type SearchResultItem } from "../search/search.types.js";

export interface SummaryInput {
  query: string;
  results: SearchResultItem[];
}

export interface SummaryOutput {
  text: string;
  model: string;
}
