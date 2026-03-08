import { blockedDomains, blockedKeywords } from "./safety.rules.js";
import { type SearchResultItem } from "../search/search.types.js";
import { type SafetyDecision } from "./safety.types.js";

const isBlocked = (result: SearchResultItem): boolean => {
  const host = new URL(result.url).hostname;
  if (blockedDomains.has(host)) {
    return true;
  }

  const haystack = `${result.title} ${result.snippet}`.toLowerCase();
  return blockedKeywords.some((keyword) => haystack.includes(keyword));
};

export const safetyService = {
  filter(results: SearchResultItem[]): SafetyDecision {
    const safeResults: SearchResultItem[] = [];
    const reasons: string[] = [];
    let blockedCount = 0;

    for (const result of results) {
      if (isBlocked(result)) {
        blockedCount += 1;
        reasons.push(`Blocked result: ${result.url}`);
        continue;
      }

      safeResults.push(result);
    }

    return { safeResults, blockedCount, reasons };
  },
};
