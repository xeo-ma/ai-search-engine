import type { SearchResultDto } from './dto.js';

const EVIDENCE_SELECTION_LIMIT = 5;
const TOKEN_PATTERN = /[a-z0-9]+/g;
const LOW_INFORMATION_PATTERN =
  /\b(sign in|signin|log in|login|register|create account|subscribe|cookie policy|privacy policy|terms|access denied|404|page unavailable|javascript required|enable cookies|learn more|read more)\b/i;
const BROAD_ACRONYM_QUERY_PATTERN = /^(ai|a\.i\.|ml|llm|nlp)$/i;
const REFERENCE_DOMAIN_PATTERN = /(?:^|\.)((wikipedia\.org|britannica\.com|arxiv\.org|nature\.com|science\.org|nih\.gov|nasa\.gov))$/i;
const PRODUCT_DOMAIN_PATTERN =
  /(?:^|\.)((openai\.com|chatgpt\.com|gemini\.google\.com|cloud\.google\.com|ai\.google|perplexity\.ai|claude\.ai|google\.ai))$/i;

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

function isBroadAcronymQuery(query: string): boolean {
  return BROAD_ACRONYM_QUERY_PATTERN.test(query.trim().toLowerCase());
}

function isReferenceDomain(domain: string): boolean {
  return REFERENCE_DOMAIN_PATTERN.test(domain);
}

function isProductDomain(domain: string): boolean {
  return PRODUCT_DOMAIN_PATTERN.test(domain);
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

export function rankSearchResults(query: string, preparedResults: PreparedResult[]): RankedSearchResult[] {
  const queryText = query.trim().toLowerCase();
  const queryTokens = tokenize(queryText);
  const broadAcronymQuery = isBroadAcronymQuery(queryText);
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

export function buildSummaryEvidenceSelection(query: string, results: SearchResultDto[]): SummaryEvidenceSelection {
  const normalized = normalizeSearchResults(results);
  const { deduped } = dedupeSearchResults(query, normalized);
  const ranked = rankSearchResults(query, deduped);
  const filtered = filterRankedResults(ranked);
  const selectedEvidence = selectEvidenceForSummary(filtered, query);

  return {
    retrievedCount: normalized.length,
    selectedCount: selectedEvidence.length,
    selectedEvidence,
  };
}
