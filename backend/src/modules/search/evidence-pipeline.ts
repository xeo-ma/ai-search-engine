import type { SearchRankingAuditDto, SearchResultDto } from './dto.js';

const EVIDENCE_SELECTION_LIMIT = 5;
const TOKEN_PATTERN = /[a-z0-9]+/g;
const LOW_INFORMATION_PATTERN =
  /\b(sign in|signin|log in|login|register|create account|subscribe|cookie policy|privacy policy|terms|access denied|404|page unavailable|javascript required|enable cookies|learn more|read more)\b/i;
const BROAD_ACRONYM_QUERY_PATTERN = /^(ai|a\.i\.|ml|llm|nlp)$/i;
const REFERENCE_DOMAIN_PATTERN = /(?:^|\.)((wikipedia\.org|britannica\.com|arxiv\.org|nature\.com|science\.org|nih\.gov|nasa\.gov))$/i;
const PRODUCT_DOMAIN_PATTERN =
  /(?:^|\.)((openai\.com|chatgpt\.com|gemini\.google\.com|cloud\.google\.com|ai\.google|perplexity\.ai|claude\.ai|google\.ai))$/i;
const LOW_TRUST_DOMAIN_DEMOTIONS: Array<[RegExp, number]> = [
  [/(?:^|\.)x\.com$/i, 3.2],
  [/(?:^|\.)twitter\.com$/i, 3.2],
  [/(?:^|\.)tiktok\.com$/i, 3.2],
  [/(?:^|\.)instagram\.com$/i, 3.0],
  [/(?:^|\.)facebook\.com$/i, 3.0],
  [/(?:^|\.)linkedin\.com$/i, 1.8],
  [/(?:^|\.)medium\.com$/i, 1.2],
  [/(?:^|\.)dev\.to$/i, 1.2],
  [/(?:^|\.)plainenglish\.io$/i, 1.4],
  [/(?:^|\.)substack\.com$/i, 1.1],
  [/(?:^|\.)blogspot\.com$/i, 1.6],
  [/(?:^|\.)wordpress\.com$/i, 1.3],
  [/(?:^|\.)tumblr\.com$/i, 1.5],
  [/(?:^|\.)wixsite\.com$/i, 1.6],
  [/(?:^|\.)weebly\.com$/i, 1.6],
];
const SPAMMY_RESULT_PATTERN =
  /\b(top\s+\d+|best\s+.+\b(2024|2025|2026|2027)\b|boost(ing)? efficiency|ultimate guide|sponsored|advertorial|buy now|limited time|free trial|pricing plans|coupon|promo code)\b/i;
const SENSITIVE_RESULT_PATTERN =
  /\b(explicit|porn|porno|pornography|sex video|nude|nudity|xxx|graphic violence|beheading|gore|gory|bloodbath|suicide method|self-harm method)\b/i;
const SENSITIVE_CONTEXT_ALLOWLIST_PATTERN =
  /\b(medical|clinical|health|safety|prevention|education|educational|research|news|journalism|reporting|policy|academic|history|historical)\b/i;

const DOMAIN_QUALITY_SCORES: Array<[RegExp, number]> = [
  [/(?:^|\.)wikipedia\.org$/i, 2.5],
  [/(?:^|\.)britannica\.com$/i, 2.5],
  [/(?:^|\.)merriam-webster\.com$/i, 2.2],
  [/(?:^|\.)dictionary\.com$/i, 2.0],
  [/(?:^|\.)cambridge\.org$/i, 2.0],
  [/(?:^|\.)nasa\.gov$/i, 2.8],
  [/(?:^|\.)nih\.gov$/i, 2.8],
  [/(?:^|\.)docs\./i, 1.5],
  [/(?:^|\.)developer\./i, 1.5],
  [/(?:^|\.)github\.com$/i, 1.0],
];

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is',
  'it', 'of', 'on', 'or', 'that', 'the', 'to', 'with',
]);

interface PreparedResult {
  result: SearchResultDto;
  index: number;
  domain: string;
  titleTokens: Set<string>;
  snippetTokens: Set<string>;
  mergedTokens: Set<string>;
}

interface DedupeResult {
  deduped: PreparedResult[];
  removedExactDuplicates: number;
  removedNearDuplicates: number;
}

interface ScoreBreakdown {
  exactTitleMatch: number;
  exactSnippetMatch: number;
  lexicalTitleOverlap: number;
  lexicalSnippetOverlap: number;
  sourceQuality: number;
  lowTrustDomainDemotion: number;
  spammyResultDemotion: number;
  safeModeSensitiveDemotion: number;
  broadAcronymReferenceBoost: number;
  broadAcronymProductDemotion: number;
  lowInformationDemotion: number;
  duplicateDomainDemotion: number;
  nearDuplicateDemotion: number;
  total: number;
}

export interface RankedSearchResult {
  result: SearchResultDto;
  index: number;
  domain: string;
  score: number;
  overlap: number;
  lowInformation: boolean;
  breakdown: ScoreBreakdown;
}

export interface SummaryEvidenceSelection {
  retrievedCount: number;
  selectedCount: number;
  selectedEvidence: SearchResultDto[];
}

interface RankingOptions {
  safeMode?: boolean;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim().toLowerCase().replace(/\/$/, '');
  }
}

function tokenize(text: string): Set<string> {
  const matches = text.toLowerCase().match(TOKEN_PATTERN) ?? [];
  const tokens = matches.filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  return new Set(tokens);
}

function overlapRatio(queryTokens: Set<string>, candidateTokens: Set<string>): number {
  if (queryTokens.size === 0 || candidateTokens.size === 0) {
    return 0;
  }

  let matched = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      matched += 1;
    }
  }

  return matched / queryTokens.size;
}

function tokenSetSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function isLowInformation(result: SearchResultDto): boolean {
  const content = `${result.title} ${result.description}`;
  return LOW_INFORMATION_PATTERN.test(content);
}

function sourceQualityScore(domain: string): number {
  for (const [pattern, score] of DOMAIN_QUALITY_SCORES) {
    if (pattern.test(domain)) {
      return score;
    }
  }
  return 0;
}

function lowTrustDomainDemotion(domain: string): number {
  for (const [pattern, score] of LOW_TRUST_DOMAIN_DEMOTIONS) {
    if (pattern.test(domain)) {
      return score;
    }
  }
  return 0;
}

function isBroadAcronymQuery(query: string): boolean {
  return BROAD_ACRONYM_QUERY_PATTERN.test(query.trim().toLowerCase());
}

function isReferenceDomain(domain: string): boolean {
  return REFERENCE_DOMAIN_PATTERN.test(domain);
}

function isProductDomain(domain: string): boolean {
  return PRODUCT_DOMAIN_PATTERN.test(domain);
}

function isSpammyResult(result: SearchResultDto): boolean {
  const content = `${result.title} ${result.description}`;
  return SPAMMY_RESULT_PATTERN.test(content);
}

function safeModeSensitiveDemotion(result: SearchResultDto, safeMode: boolean): number {
  if (!safeMode) {
    return 0;
  }

  const content = `${result.title} ${result.description}`;
  if (!SENSITIVE_RESULT_PATTERN.test(content)) {
    return 0;
  }

  if (SENSITIVE_CONTEXT_ALLOWLIST_PATTERN.test(content)) {
    return 0.8;
  }

  return 3.4;
}

function prepareResults(results: SearchResultDto[]): PreparedResult[] {
  return results.map((result, index) => {
    const domain = extractDomain(result.url);
    const titleTokens = tokenize(result.title);
    const snippetTokens = tokenize(result.description);
    const mergedTokens = new Set([...titleTokens, ...snippetTokens]);

    return {
      result,
      index,
      domain,
      titleTokens,
      snippetTokens,
      mergedTokens,
    };
  });
}

export function normalizeSearchResults(results: SearchResultDto[]): SearchResultDto[] {
  return results
    .map((result) => ({
      ...result,
      title: result.title.trim(),
      url: result.url.trim(),
      description: result.description.trim(),
    }))
    .filter((result) => Boolean(result.title && result.url && result.description));
}

export function dedupeSearchResults(query: string, results: SearchResultDto[]): DedupeResult {
  const prepared = prepareResults(results);
  const seenCanonicalUrls = new Set<string>();
  const deduped: PreparedResult[] = [];
  let removedExactDuplicates = 0;
  let removedNearDuplicates = 0;
  const queryTokens = tokenize(query);

  for (const candidate of prepared) {
    const canonicalUrl = canonicalizeUrl(candidate.result.url);
    if (seenCanonicalUrls.has(canonicalUrl)) {
      removedExactDuplicates += 1;
      continue;
    }
    seenCanonicalUrls.add(canonicalUrl);

    const nearDuplicateIndex = deduped.findIndex((existing) => {
      if (candidate.domain !== existing.domain) {
        return false;
      }
      return tokenSetSimilarity(candidate.mergedTokens, existing.mergedTokens) >= 0.9;
    });

    if (nearDuplicateIndex >= 0) {
      removedNearDuplicates += 1;
      const existing = deduped[nearDuplicateIndex];
      if (!existing) {
        continue;
      }
      const candidateScore =
        overlapRatio(queryTokens, candidate.mergedTokens) + candidate.result.description.length / 1000;
      const existingScore =
        overlapRatio(queryTokens, existing.mergedTokens) + existing.result.description.length / 1000;

      if (candidateScore > existingScore) {
        deduped[nearDuplicateIndex] = candidate;
      }
      continue;
    }

    deduped.push(candidate);
  }

  return { deduped, removedExactDuplicates, removedNearDuplicates };
}

export function rankSearchResults(
  query: string,
  preparedResults: PreparedResult[],
  options: RankingOptions = {},
): RankedSearchResult[] {
  const queryText = query.trim().toLowerCase();
  const queryTokens = tokenize(queryText);
  const broadAcronymQuery = isBroadAcronymQuery(queryText);
  const safeMode = options.safeMode ?? true;
  const domainCounts = new Map<string, number>();

  for (const item of preparedResults) {
    domainCounts.set(item.domain, (domainCounts.get(item.domain) ?? 0) + 1);
  }

  return preparedResults.map((item) => {
    const titleText = item.result.title.toLowerCase();
    const snippetText = item.result.description.toLowerCase();
    const exactTitle = queryText.length > 1 && titleText.includes(queryText);
    const exactSnippet = queryText.length > 1 && snippetText.includes(queryText);
    const titleOverlap = overlapRatio(queryTokens, item.titleTokens);
    const snippetOverlap = overlapRatio(queryTokens, item.snippetTokens);
    const combinedOverlap = overlapRatio(queryTokens, item.mergedTokens);
    const lowInformation = isLowInformation(item.result);
    const sourceQuality = sourceQualityScore(item.domain);
    const lowTrustDemotion = lowTrustDomainDemotion(item.domain);
    const spammyResultDemotion = isSpammyResult(item.result) ? 1.5 : 0;
    const sensitiveDemotion = safeModeSensitiveDemotion(item.result, safeMode);
    const broadAcronymReferenceBoost = broadAcronymQuery && isReferenceDomain(item.domain) ? 1.6 : 0;
    const broadAcronymProductDemotion = broadAcronymQuery && isProductDomain(item.domain) ? 2.4 : 0;
    const domainCount = domainCounts.get(item.domain) ?? 0;
    const duplicateDomainDemotion = domainCount > 1 ? (domainCount - 1) * 0.4 : 0;

    const nearDuplicateDemotion = preparedResults.some((other) => {
      if (other.index === item.index || other.domain !== item.domain) {
        return false;
      }
      const similarity = tokenSetSimilarity(item.mergedTokens, other.mergedTokens);
      return similarity >= 0.75 && similarity < 0.9;
    })
      ? 0.6
      : 0;

    const breakdown: ScoreBreakdown = {
      exactTitleMatch: exactTitle ? 3.5 : 0,
      exactSnippetMatch: exactSnippet ? 2 : 0,
      lexicalTitleOverlap: titleOverlap * 4,
      lexicalSnippetOverlap: snippetOverlap * 2.5,
      sourceQuality,
      lowTrustDomainDemotion: lowTrustDemotion,
      spammyResultDemotion,
      safeModeSensitiveDemotion: sensitiveDemotion,
      broadAcronymReferenceBoost,
      broadAcronymProductDemotion,
      lowInformationDemotion: lowInformation ? 2.5 : 0,
      duplicateDomainDemotion,
      nearDuplicateDemotion,
      total: 0,
    };

    const total =
      breakdown.exactTitleMatch +
      breakdown.exactSnippetMatch +
      breakdown.lexicalTitleOverlap +
      breakdown.lexicalSnippetOverlap +
      breakdown.sourceQuality +
      breakdown.broadAcronymReferenceBoost -
      breakdown.lowTrustDomainDemotion -
      breakdown.spammyResultDemotion -
      breakdown.safeModeSensitiveDemotion -
      breakdown.broadAcronymProductDemotion -
      breakdown.lowInformationDemotion -
      breakdown.duplicateDomainDemotion -
      breakdown.nearDuplicateDemotion;

    breakdown.total = total;

    return {
      result: item.result,
      index: item.index,
      domain: item.domain,
      score: total,
      overlap: combinedOverlap,
      lowInformation,
      breakdown,
    };
  });
}

export function rerankSearchResults(
  query: string,
  results: SearchResultDto[],
  options: RankingOptions = {},
): SearchResultDto[] {
  const normalized = normalizeSearchResults(results);
  const { deduped } = dedupeSearchResults(query, normalized);
  const ranked = rankSearchResults(query, deduped, options).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.index - right.index;
  });

  return ranked.map((item) => item.result);
}

function filterRankedResults(rankedResults: RankedSearchResult[]): RankedSearchResult[] {
  const filtered = rankedResults.filter((item) => {
    if (item.score >= 0.2) {
      return true;
    }
    if (item.overlap >= 0.25) {
      return true;
    }

    const hasExactMatch = item.breakdown.exactTitleMatch > 0 || item.breakdown.exactSnippetMatch > 0;
    return hasExactMatch && !item.lowInformation;
  });

  return filtered.length > 0 ? filtered : rankedResults;
}

export function selectEvidenceForSummary(rankedResults: RankedSearchResult[], query = ''): SearchResultDto[] {
  const sorted = [...rankedResults].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.index - right.index;
  });

  const selected: RankedSearchResult[] = [];
  const usedDomains = new Set<string>();
  const broadAcronymQuery = isBroadAcronymQuery(query);

  if (broadAcronymQuery) {
    const strongestReference = sorted.find((candidate) => isReferenceDomain(candidate.domain));
    if (strongestReference) {
      selected.push(strongestReference);
      usedDomains.add(strongestReference.domain);
    }
  }

  for (const candidate of sorted) {
    if (selected.length >= EVIDENCE_SELECTION_LIMIT) {
      break;
    }
    if (!candidate.domain || usedDomains.has(candidate.domain)) {
      continue;
    }
    selected.push(candidate);
    usedDomains.add(candidate.domain);
  }

  for (const candidate of sorted) {
    if (selected.length >= EVIDENCE_SELECTION_LIMIT) {
      break;
    }
    if (selected.includes(candidate)) {
      continue;
    }
    selected.push(candidate);
  }

  return selected.slice(0, EVIDENCE_SELECTION_LIMIT).map((item) => item.result);
}

export function buildSummaryEvidenceSelection(
  query: string,
  results: SearchResultDto[],
  options: RankingOptions = {},
): SummaryEvidenceSelection {
  const normalized = normalizeSearchResults(results);
  const { deduped } = dedupeSearchResults(query, normalized);
  const ranked = rankSearchResults(query, deduped, options);
  const filtered = filterRankedResults(ranked);
  const selectedEvidence = selectEvidenceForSummary(filtered, query);

  return {
    retrievedCount: normalized.length,
    selectedCount: selectedEvidence.length,
    selectedEvidence,
  };
}

export function buildRankingAudit(
  query: string,
  results: SearchResultDto[],
  options: RankingOptions = {},
): SearchRankingAuditDto {
  const normalized = normalizeSearchResults(results);
  const { deduped } = dedupeSearchResults(query, normalized);
  const ranked = rankSearchResults(query, deduped, options);
  const safeModeRequested = options.safeMode ?? true;

  let lowTrustDemotions = 0;
  let spammyDemotions = 0;
  let sensitiveDemotions = 0;
  let contextualSensitiveDemotions = 0;

  for (const item of ranked) {
    if (item.breakdown.lowTrustDomainDemotion > 0) {
      lowTrustDemotions += 1;
    }
    if (item.breakdown.spammyResultDemotion > 0) {
      spammyDemotions += 1;
    }
    if (item.breakdown.safeModeSensitiveDemotion > 0) {
      sensitiveDemotions += 1;
      if (item.breakdown.safeModeSensitiveDemotion < 3.4) {
        contextualSensitiveDemotions += 1;
      }
    }
  }

  const demotionReasonCounts: Array<[string, number]> = [
    ['low-trust domains', lowTrustDemotions],
    ['spammy results', spammyDemotions],
    ['sensitive results', sensitiveDemotions],
    ['context-softened sensitive results', contextualSensitiveDemotions],
  ];

  const topDemotionReasons = demotionReasonCounts
    .filter((entry) => entry[1] > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([label]) => label);

  return {
    safeModeRequested,
    safeSearchLevel: safeModeRequested ? 'strict' : 'off',
    reranked: true,
    lowTrustDemotions,
    spammyDemotions,
    sensitiveDemotions,
    contextualSensitiveDemotions,
    topDemotionReasons,
  };
}
