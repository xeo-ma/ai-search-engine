import { z } from 'zod';

export const searchPlanSchema = z.enum(['free', 'pro']);
export type SearchPlanDto = z.infer<typeof searchPlanSchema>;

export const searchRequestSchema = z.object({
  query: z.string().trim().min(1),
  safeMode: z.boolean().default(true),
  plan: searchPlanSchema.default('free'),
  deepSearch: z.boolean().default(false),
  count: z.number().int().min(1).max(20).optional(),
  offset: z.number().int().min(0).optional(),
  country: z.string().length(2).optional(),
  searchLang: z.string().min(2).max(5).optional(),
});

export type SearchRequestDto = z.infer<typeof searchRequestSchema>;

export interface SearchResultDto {
  id: string;
  title: string;
  url: string;
  displayUrl?: string | undefined;
  description: string;
  source: 'brave';
  language?: string | undefined;
  publishedAt?: string | undefined;
  age?: string | undefined;
}

export interface SearchRankingAuditDto {
  safeModeRequested: boolean;
  safeSearchLevel: 'strict' | 'off';
  reranked: boolean;
  lowTrustDemotions: number;
  spammyDemotions: number;
  sensitiveDemotions: number;
  contextualSensitiveDemotions: number;
  topDemotionReasons: string[];
}

export interface SearchCapabilitiesDto {
  plan: SearchPlanDto;
  deepSearchRequested: boolean;
  deepSearchAllowed: boolean;
  deepSearchApplied: boolean;
}

export interface SearchResponseDto {
  query: string;
  safeModeApplied: boolean;
  summary: string | null;
  summaryError?: string | null;
  sources: Array<{ title: string; url: string }>;
  results: SearchResultDto[];
  retrievedCount?: number | undefined;
  selectedCount?: number | undefined;
  selectedEvidence?: SearchResultDto[] | undefined;
  rankingAudit?: SearchRankingAuditDto | undefined;
  capabilities?: SearchCapabilitiesDto | undefined;
  moreResultsAvailable?: boolean | undefined;
}
