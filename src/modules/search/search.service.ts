import { webSearchClient } from "../../clients/web-search.client.js";
import { type SearchResultItem } from "./search.types.js";

export const searchService = {
  async run(query: string): Promise<SearchResultItem[]> {
    return webSearchClient.search(query);
  },
};
