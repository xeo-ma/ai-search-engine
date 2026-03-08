import { env } from "../config/env.js";
import { type SearchResultItem } from "../modules/search/search.types.js";

export const webSearchClient = {
  async search(query: string): Promise<SearchResultItem[]> {
    void env.webSearchApiKey;
    void env.webSearchApiUrl;

    return [
      {
        title: `Top result for ${query}`,
        url: "https://example.com/result-1",
        snippet: `Stubbed search result for query: ${query}`,
      },
      {
        title: `Secondary result for ${query}`,
        url: "https://example.com/result-2",
        snippet: `Second stubbed search result for query: ${query}`,
      },
    ];
  },
};
