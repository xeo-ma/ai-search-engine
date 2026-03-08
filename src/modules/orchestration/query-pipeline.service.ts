import { env } from "../../config/env.js";
import { cacheKeys } from "../cache/cache.keys.js";
import { cacheService } from "../cache/cache.service.js";
import { searchService } from "../search/search.service.js";
import { type SearchInput, type SearchResultItem } from "../search/search.types.js";
import { safetyService } from "../safety/safety.service.js";
import { summarizeService } from "../summarize/summarize.service.js";
import { type SummaryOutput } from "../summarize/summarize.types.js";

export interface QueryPipelineOutput {
  query: string;
  safeMode: boolean;
  results: SearchResultItem[];
  summary: SummaryOutput;
  safetyMeta: {
    blockedCount: number;
    reasons: string[];
  };
}

export const queryPipelineService = {
  async execute(input: SearchInput): Promise<QueryPipelineOutput> {
    const safeMode = input.safeMode ?? env.safeModeDefault;
    const key = cacheKeys.search(input.query, safeMode);

    const cached = await cacheService.get<QueryPipelineOutput>(key);
    if (cached) {
      return cached;
    }

    const rawResults = await searchService.run(input.query);

    const safetyDecision = safeMode
      ? safetyService.filter(rawResults)
      : { safeResults: rawResults, blockedCount: 0, reasons: [] };

    const summary = await summarizeService.summarize({
      query: input.query,
      results: safetyDecision.safeResults,
    });

    const output: QueryPipelineOutput = {
      query: input.query,
      safeMode,
      results: safetyDecision.safeResults,
      summary,
      safetyMeta: {
        blockedCount: safetyDecision.blockedCount,
        reasons: safetyDecision.reasons,
      },
    };

    await cacheService.set(key, output);

    return output;
  },
};
