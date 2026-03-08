import { type SearchResultItem } from "../search/search.types.js";

export interface SafetyDecision {
  safeResults: SearchResultItem[];
  blockedCount: number;
  reasons: string[];
}
