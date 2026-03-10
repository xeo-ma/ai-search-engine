import { OpenAiSummarizationProvider } from '../providers/llm/openai.provider.js';
import type { LlmSummarizationProvider, SummarySource } from '../providers/llm/provider.interface.js';
import {
  OpenAiClaimEvidenceClient,
  type EvidenceSourceItem,
} from './openai-claim-evidence.client.js';

const MAX_SUMMARY_CONTEXT_RESULTS = 3;
const MAX_SUMMARY_DISPLAY_SOURCES = 3;
const MAX_SUMMARY_SENTENCES = 4;
const MAX_DEFINITION_STYLE_SUMMARY_SENTENCES = 3;
const MIN_CLAIM_WORDS = 3;
const MIN_CLAIM_EVIDENCE_OVERLAP = 0.08;
const SUMMARY_CACHE_TTL_MS = 15 * 60 * 1000;
const TOKEN_PATTERN = /[a-z0-9]+/g;
const SENTENCE_SPLIT_PATTERN = /[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g;
const CITATION_MARKER_PATTERN = /\s*\[\d+\]/g;
const LETTERS_ONLY_PATTERN = /^[a-zA-Z]+$/;
const LEADING_FRAGMENT_PUNCTUATION_PATTERN = /^[,;:)\]-]/;
const LEADING_FRAGMENT_CONNECTOR_PATTERN =
  /^(and|or|but|so|yet|because|while|whereas|which|who|whom|whose|that|including|such as)\b/;
const COMMON_VERB_PATTERN =
  /\b(is|are|was|were|be|being|been|has|have|had|do|does|did|can|could|will|would|should|may|might|must|mean|means|meant|include|includes|included|including|drive|drives|driven|study|studies|studied|help|helps|helped|power|powers|powered|focus|focuses|focused|frame|frames|framed|shed|sheds|shedding|call|called|refer|refers|referred|use|uses|used|support|supports|supported|enable|enables|enabled|show|shows|shown|explain|explains|explained|provide|provides|provided|underpin|underpins|underpinned)\b/i;
const LOW_INFORMATION_SNIPPET_PATTERN =
  /\b(enter|click|sign in|log in|get started|learn more|read more|continue|subscribe|join now|try now|cannot provide a description|page unavailable|access denied|javascript required|enable cookies)\b/i;
const INCOMPLETE_SENTENCE_END_PATTERN =
  /\b(and|or|but|so|yet|including|such as|and even|as well as|especially|like)\b[\s,.!?;:]*$/i;
const SUPPORT_SENTENCE_PATTERN =
  /^(reference sources |across reference sources|authoritative references|top sources cover this topic)/i;
const WEAK_SOURCE_TEXT_PATTERN =
  /\b(sign in|signin|log in|login|register|create account|subscribe|cookie policy|privacy policy|terms of service|access denied|404)\b/i;
const COMMERCIAL_SOURCE_TEXT_PATTERN =
  /\b(company|taproom|kitchen|menu|shop|store|pricing|plans|book now|buy now|trial|broker|trading|official site)\b/i;
const ENTERTAINMENT_DOMAIN_PATTERN =
  /(?:^|\.)((youtube|imdb|spotify|netflix|hulu|genius|fandom|songfacts)\.com)$/i;
const DICTIONARY_DOMAIN_PATTERN =
  /(?:^|\.)((dictionaryapi\.dev|dictionary\.com|merriam-webster\.com|cambridge\.org|oxfordlearnersdictionaries\.com|vocabulary\.com))$/i;
const LEXICAL_SOURCE_TEXT_PATTERN =
  /\b(definition|meaning|etymology|usage|word origin|part of speech|noun|verb|adjective|linguistics)\b/i;
const REFERENCE_DOMAIN_PATTERN =
  /(?:^|\.)((wikipedia\.org|britannica\.com|arxiv\.org|nature\.com|science\.org|nih\.gov|nasa\.gov))$/i;
const PRODUCT_DOMAIN_PATTERN =
  /(?:^|\.)((openai\.com|chatgpt\.com|gemini\.google\.com|cloud\.google\.com|perplexity\.ai|claude\.ai))$/i;
const AUTHORITY_DOMAIN_SCORES: Array<[RegExp, number]> = [
  [/(?:^|\.)fastify\.dev$/i, 3],
  [/(?:^|\.)github\.com$/i, 1.5],
  [/(?:^|\.)wikipedia\.org$/i, 3],
  [/(?:^|\.)britannica\.com$/i, 3],
  [/(?:^|\.)ibm\.com$/i, 2.5],
  [/(?:^|\.)dictionary\.com$/i, 2.5],
  [/(?:^|\.)merriam-webster\.com$/i, 2.5],
  [/(?:^|\.)cambridge\.org$/i, 2.5],
  [/(?:^|\.)oxfordlearnersdictionaries\.com$/i, 2.5],
  [/(?:^|\.)docs\./i, 2],
  [/(?:^|\.)developer\./i, 2],
];
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is',
  'it', 'of', 'on', 'or', 'that', 'the', 'to', 'with',
]);
const EXPLANATORY_QUERY_PATTERN = /^(what is|what are|what does|explain)\b|\b(explained|overview|basics?)$/i;
const COMPARISON_QUERY_PATTERN = /\b(vs|versus|compare|difference between)\b/i;
const TUTORIAL_TEXT_PATTERN = /\b(introduction|tutorial|guide|practical guide|get started|getting started)\b/i;
const SOCIAL_DOMAIN_PATTERN = /(?:^|\.)((x\.com|twitter\.com|instagram\.com|facebook\.com|tiktok\.com|linkedin\.com))$/i;
const PERSONAL_BLOG_PATTERN =
  /\b(blog|substack|medium|wordpress|blogspot|ghost|newsletter)\b/i;
const BLOG_HOST_PATTERN =
  /(?:^|\.)((dev\.to|medium\.com|substack\.com|hashnode\.dev|plainenglish\.io))$/i;
const BROAD_ACRONYM_QUERY_PATTERN = /^(ai|a\.i\.|ml|llm|nlp)$/i;
const HACKER_NEWS_QUERY_PATTERN = /^(hacker news|hn)$/i;
const MARKETING_HEAVY_TEXT_PATTERN =
  /\b(#1|trusted source|top platform|real-time updates|actionable insights|transformative|revolutionary|game[- ]changing|cutting-edge|industry-leading|it'?s no surprise)\b/i;
const TECHNICAL_QUERY_HINT_PATTERN =
  /\b(architecture|system|design|api|backend|frontend|database|cache|kubernetes|docker|fastify|react|node|typescript|oauth|jwt|csrf|redis|implementation|performance)\b/i;
const MIN_SUMMARY_CONFIDENCE_SCORE = 0.45;
const LOW_CONFIDENCE_SUMMARY_MESSAGE = 'Not enough reliable sources yet to generate a trustworthy summary.';

export interface SummarizationResult {
  summary: string | null;
  error: string | null;
  sources: EvidenceSourceItem[];
  claims: SummaryClaim[];
}

export interface SummaryClaim {
  id: string;
  text: string;
  evidence: EvidenceSourceItem[];
}

export interface SummarizationServiceOptions {
  provider?: LlmSummarizationProvider;
  openAiApiKey?: string;
}

export class SummarizationService {
  private readonly provider: LlmSummarizationProvider | null;
  private readonly claimEvidenceClient: OpenAiClaimEvidenceClient | null;
  private readonly summaryCache = new Map<string, { expiresAt: number; value: SummarizationResult }>();

  constructor(options: SummarizationServiceOptions = {}) {
    const apiKey = options.openAiApiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.provider =
      options.provider ??
      (apiKey
        ? new OpenAiSummarizationProvider({
            apiKey,
          })
        : null);
    this.claimEvidenceClient = apiKey ? new OpenAiClaimEvidenceClient(apiKey) : null;
  }

  async summarize(query: string, results: SummarySource[]): Promise<SummarizationResult> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return { summary: null, error: null, sources: [], claims: [] };
    }

    const definitionStyleQuery = this.isLikelyDefinitionQuery(trimmedQuery);
    const candidateResults = this.selectSummaryResults(trimmedQuery, results, definitionStyleQuery);
    if (candidateResults.length === 0) {
      return { summary: null, error: null, sources: [], claims: [] };
    }
    const broadAcronymQuery = this.isBroadAcronymQuery(trimmedQuery);
    const cacheKey = this.buildSummaryCacheKey(trimmedQuery, candidateResults);
    const cached = this.readSummaryCache(cacheKey);
    if (cached) {
      return cached;
    }

    const fallbackSources = candidateResults.map((result, index) => this.toEvidenceSource(result, index));
    const rankedFallbackSources = this.selectDisplaySources(fallbackSources, trimmedQuery);
    const maxSentences = definitionStyleQuery ? MAX_DEFINITION_STYLE_SUMMARY_SENTENCES : MAX_SUMMARY_SENTENCES;

    if (this.claimEvidenceClient) {
      try {
        const grounded = await this.claimEvidenceClient.generate(trimmedQuery, definitionStyleQuery);
        const groundedSources = this.selectDisplaySources(grounded.sources, trimmedQuery);
        if (groundedSources.length === 0) {
          const response = this.buildLocalFallbackResponse(
            candidateResults,
            rankedFallbackSources,
            maxSentences,
            trimmedQuery,
            definitionStyleQuery,
          );
          const gated = this.applySummaryConfidenceGate(trimmedQuery, response);
          this.writeSummaryCache(cacheKey, gated);
          return gated;
        } else {
          const normalizedSummary = this.toNaturalSummary(
            grounded.answerText,
            maxSentences,
            trimmedQuery,
            definitionStyleQuery,
          );
          const fallbackSummary = this.toNaturalSummary(
            this.buildFallbackSummary(trimmedQuery, candidateResults),
            maxSentences,
            trimmedQuery,
            definitionStyleQuery,
          );
          const summaryText =
            normalizedSummary && this.shouldUseFallbackSummary(normalizedSummary, trimmedQuery)
              ? fallbackSummary ?? normalizedSummary
              : normalizedSummary ?? fallbackSummary;
          const rawClaimTexts = this.extractClaims(summaryText, maxSentences);
          const claimTexts = this.filterRedundantClaims(summaryText, rawClaimTexts);
          if (claimTexts.length === 0) {
            const response = {
              summary: summaryText,
              error: null,
              sources: groundedSources,
              claims: [],
            };
            const gated = this.applySummaryConfidenceGate(trimmedQuery, response);
            this.writeSummaryCache(cacheKey, gated);
            return gated;
          }

          const response = {
            summary: claimTexts.join(' '),
            error: null,
            sources: groundedSources,
            claims: this.mapClaimsToEvidence(claimTexts, groundedSources, broadAcronymQuery),
          };
          const gated = this.applySummaryConfidenceGate(trimmedQuery, response);
          this.writeSummaryCache(cacheKey, gated);
          return gated;
      }
    } catch {
      const response = this.buildLocalFallbackResponse(
        candidateResults,
        rankedFallbackSources,
        maxSentences,
        trimmedQuery,
        definitionStyleQuery,
      );
      const gated = this.applySummaryConfidenceGate(trimmedQuery, response);
      this.writeSummaryCache(cacheKey, gated);
      return gated;
    }
    }

    if (!this.provider) {
      const response = {
        summary: this.buildFallbackSummary(trimmedQuery, candidateResults),
        error: null,
        sources: rankedFallbackSources,
        claims: this.mapClaimsToEvidence(
          this.filterRedundantClaims(
            this.buildFallbackSummary(trimmedQuery, candidateResults),
            this.extractClaims(
              this.buildFallbackSummary(trimmedQuery, candidateResults),
              MAX_DEFINITION_STYLE_SUMMARY_SENTENCES,
            ),
          ),
          rankedFallbackSources,
          broadAcronymQuery,
        ),
      };
      const gated = this.applySummaryConfidenceGate(trimmedQuery, response);
      this.writeSummaryCache(cacheKey, gated);
      return gated;
    }

    try {
      const ambiguousQuery = this.isLikelyAmbiguous(trimmedQuery, candidateResults);
      const summary = await this.provider.summarize({
        query: trimmedQuery,
        results: candidateResults,
        ambiguousQuery,
        definitionStyleQuery,
      });

      const normalizedSummary = this.toNaturalSummary(summary, maxSentences, trimmedQuery, definitionStyleQuery);
      const fallbackSummary = this.toNaturalSummary(
        this.buildFallbackSummary(trimmedQuery, candidateResults),
        maxSentences,
        trimmedQuery,
        definitionStyleQuery,
      );
      const summaryText =
        normalizedSummary && this.shouldUseFallbackSummary(normalizedSummary, trimmedQuery)
          ? fallbackSummary ?? normalizedSummary
          : normalizedSummary;
      const rawClaimTexts = this.extractClaims(summaryText, maxSentences);
      const claimTexts = this.filterRedundantClaims(summaryText, rawClaimTexts);

      const response = {
        summary: summaryText,
        error: rawClaimTexts.length === 0 ? 'Model output could not be structured into claims.' : null,
        sources: rankedFallbackSources,
        claims: this.mapClaimsToEvidence(claimTexts, rankedFallbackSources, broadAcronymQuery),
      };
      const gated = this.applySummaryConfidenceGate(trimmedQuery, response);
      this.writeSummaryCache(cacheKey, gated);
      return gated;
    } catch {
      const response = {
        summary: this.toNaturalSummary(
          this.buildFallbackSummary(trimmedQuery, candidateResults),
          definitionStyleQuery ? MAX_DEFINITION_STYLE_SUMMARY_SENTENCES : MAX_SUMMARY_SENTENCES,
          trimmedQuery,
          definitionStyleQuery,
        ),
        error: 'AI summary unavailable right now.',
        sources: rankedFallbackSources,
        claims: [],
      };
      const gated = this.applySummaryConfidenceGate(trimmedQuery, response);
      this.writeSummaryCache(cacheKey, gated);
      return gated;
    }
  }

  private buildSummaryCacheKey(query: string, candidateResults: SummarySource[]): string {
    const normalizedQuery = query.trim().toLowerCase();
    const topResultFingerprint = candidateResults
      .slice(0, 3)
      .map((result) => `${result.url}|${result.title}`)
      .join('||');
    return `${normalizedQuery}::${topResultFingerprint}`;
  }

  private readSummaryCache(cacheKey: string): SummarizationResult | null {
    const entry = this.summaryCache.get(cacheKey);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.summaryCache.delete(cacheKey);
      return null;
    }

    return this.cloneSummarizationResult(entry.value);
  }

  private writeSummaryCache(cacheKey: string, value: SummarizationResult): void {
    if (!value.summary || value.error) {
      return;
    }

    this.summaryCache.set(cacheKey, {
      expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
      value: this.cloneSummarizationResult(value),
    });
  }

  private cloneSummarizationResult(value: SummarizationResult): SummarizationResult {
    return {
      summary: value.summary,
      error: value.error,
      sources: value.sources.map((source) => ({ ...source })),
      claims: value.claims.map((claim) => ({
        ...claim,
        evidence: claim.evidence.map((item) => ({ ...item })),
      })),
    };
  }

  private applySummaryConfidenceGate(query: string, response: SummarizationResult): SummarizationResult {
    if (!response.summary) {
      return response;
    }

    const lowInformationRatio =
      response.sources.length > 0
        ? response.sources.filter((source) => this.isLowInformationEvidenceSource(source)).length / response.sources.length
        : 0;
    const navigationalRatio =
      response.sources.length > 0
        ? response.sources.filter((source) => this.isNavigationalEvidenceSource(source)).length / response.sources.length
        : 0;

    if (lowInformationRatio >= 0.67 || navigationalRatio >= 0.67) {
      return {
        summary: null,
        error: LOW_CONFIDENCE_SUMMARY_MESSAGE,
        sources: response.sources,
        claims: [],
      };
    }

    const confidence = this.estimateSummaryConfidence(query, response.sources, response.claims);
    if (confidence >= MIN_SUMMARY_CONFIDENCE_SCORE) {
      return response;
    }

    return {
      summary: null,
      error: LOW_CONFIDENCE_SUMMARY_MESSAGE,
      sources: response.sources,
      claims: [],
    };
  }

  private estimateSummaryConfidence(query: string, sources: EvidenceSourceItem[], claims: SummaryClaim[]): number {
    if (sources.length === 0) {
      return 0;
    }

    const queryTokens = this.extractMeaningfulTokens(query);
    const referenceCount = sources.filter((source) => this.isReferenceSource(source)).length;
    const productCount = sources.filter((source) => this.isProductSource(source)).length;
    const informativeSources = sources.filter((source) => !this.isLowInformationEvidenceSource(source)).length;
    const navigationalSources = sources.filter((source) => this.isNavigationalEvidenceSource(source)).length;

    let score = 0;
    score += Math.min(0.45, sources.length * 0.15);
    score += Math.min(0.22, (referenceCount / sources.length) * 0.22);
    score += Math.min(0.15, (informativeSources / sources.length) * 0.15);
    score += claims.length > 0 ? Math.min(0.12, claims.length * 0.04) : 0;

    if (queryTokens.length > 0) {
      const overlapValues = sources.map((source) =>
        this.tokenOverlapRatio(
          queryTokens,
          this.extractMeaningfulTokens(`${source.title} ${source.snippet} ${source.domain}`),
        ),
      );
      const averageOverlap =
        overlapValues.length > 0 ? overlapValues.reduce((sum, value) => sum + value, 0) / overlapValues.length : 0;
      score += Math.min(0.28, averageOverlap * 0.28);
    }

    if (this.isBroadAcronymQuery(query) && referenceCount === 0) {
      score -= 0.2;
    }
    if (productCount > 0 && productCount === sources.length) {
      score -= 0.12;
    }
    if (navigationalSources / sources.length >= 0.7) {
      score -= 0.2;
    }
    if (informativeSources === 0) {
      score -= 0.25;
    }

    return Math.max(0, Math.min(1, score));
  }

  private isNavigationalEvidenceSource(source: EvidenceSourceItem): boolean {
    return /\b(login|sign in|signin|account|dashboard|portal|continue)\b/i.test(
      `${source.title} ${source.snippet} ${source.url}`,
    );
  }

  private selectSummaryResults(query: string, results: SummarySource[], definitionLikeQuery: boolean): SummarySource[] {
    const deduped: SummarySource[] = [];
    const seenUrls = new Set<string>();
    const queryTokens = this.extractMeaningfulTokens(query);
    const explanatoryQuery = this.isLikelyExplanatoryQuery(query);
    const comparisonQuery = this.isComparisonQuery(query);
    const broadAcronymQuery = this.isBroadAcronymQuery(query);
    const hackerNewsQuery = this.isHackerNewsQuery(query);
    const comparisonSides = this.extractComparisonSides(query);

    for (const result of results) {
      if (!result?.url || seenUrls.has(result.url)) {
        continue;
      }

      if (this.isWeakSource(result, queryTokens)) {
        continue;
      }

      seenUrls.add(result.url);
      deduped.push(result);
    }

    if (deduped.length === 0) {
      return results.slice(0, MAX_SUMMARY_CONTEXT_RESULTS);
    }

    const filteredForIntent = this.filterByQueryIntent(deduped, definitionLikeQuery, explanatoryQuery, comparisonQuery);

    const scored = filteredForIntent
      .map((result, index) => ({
        result,
        index,
        score: this.scoreSource(
          result,
          queryTokens,
          definitionLikeQuery,
          explanatoryQuery,
          comparisonQuery,
          comparisonSides,
          broadAcronymQuery,
          hackerNewsQuery,
        ),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);

    let selected = scored.slice(0, MAX_SUMMARY_CONTEXT_RESULTS).map((item) => item.result);
    if (broadAcronymQuery) {
      selected = this.ensureReferenceResultForBroadAcronym(selected, scored.map((item) => item.result));
    }
    return selected;
  }

  private buildLocalFallbackResponse(
    candidateResults: SummarySource[],
    rankedFallbackSources: EvidenceSourceItem[],
    maxSentences: number,
    query: string,
    definitionStyleQuery: boolean,
  ): SummarizationResult {
    const summary = this.toNaturalSummary(
      this.buildFallbackSummary(query, candidateResults),
      maxSentences,
      query,
      definitionStyleQuery,
    );
    const claimTexts = this.filterRedundantClaims(summary, this.extractClaims(summary, maxSentences));
    return {
      summary,
      error: null,
      sources: rankedFallbackSources,
      claims: this.mapClaimsToEvidence(claimTexts, rankedFallbackSources, this.isBroadAcronymQuery(query)),
    };
  }

  private filterByQueryIntent(
    results: SummarySource[],
    definitionLikeQuery: boolean,
    explanatoryQuery: boolean,
    comparisonQuery: boolean,
  ): SummarySource[] {
    if (comparisonQuery) {
      const comparisonPreferred = results.filter(
        (result) =>
          !this.isLikelySocialOrPersonalSource(result) &&
          !this.isLikelyBlogHost(result.url) &&
          !this.isLikelyCommercialSource(result),
      );
      if (comparisonPreferred.length >= 2) {
        return comparisonPreferred;
      }
    }

    if (explanatoryQuery) {
      const explanatoryPreferred = results.filter(
        (result) =>
          !this.isLikelySocialOrPersonalSource(result) &&
          !this.isEntertainmentDomain(result.url) &&
          !this.isLikelyCommercialSource(result),
      );
      if (explanatoryPreferred.length >= 2) {
        return explanatoryPreferred;
      }
    }

    if (!definitionLikeQuery) {
      return results;
    }

    const lexicalPreferred = results.filter(
      (result) =>
        !this.isEntertainmentDomain(result.url) &&
        !this.isLikelyCommercialSource(result) &&
        (this.isDictionaryDomain(result.url) || this.isLexicalSource(result)),
    );
    if (lexicalPreferred.length >= 2) {
      return lexicalPreferred;
    }

    const informational = results.filter(
      (result) => !this.isEntertainmentDomain(result.url) && !this.isLikelyCommercialSource(result),
    );
    if (informational.length >= 2) {
      return informational;
    }

    return results;
  }

  private isWeakSource(result: SummarySource, queryTokens: string[]): boolean {
    const lowerText = `${result.title} ${result.description} ${result.url}`.toLowerCase();
    if (WEAK_SOURCE_TEXT_PATTERN.test(lowerText)) {
      return true;
    }

    try {
      const url = new URL(result.url);
      const path = url.pathname.toLowerCase();
      if (/^\/(login|signin|sign-in|account|auth|checkout|cart|wp-admin)(\/|$)/.test(path)) {
        return true;
      }
    } catch {
      return false;
    }

    const overlapScore = this.queryOverlapScore(result, queryTokens);
    const thinSnippet = result.description.trim().length < 45;
    return thinSnippet && overlapScore < 0.15;
  }

  private scoreSource(
    result: SummarySource,
    queryTokens: string[],
    definitionLikeQuery: boolean,
    explanatoryQuery: boolean,
    comparisonQuery: boolean,
    comparisonSides: string[],
    broadAcronymQuery: boolean,
    hackerNewsQuery: boolean,
  ): number {
    let score = 0;
    score += this.queryOverlapScore(result, queryTokens) * 8;
    score += this.authorityScore(result.url);

    if (comparisonQuery) {
      score += this.comparisonCoverageScore(result, comparisonSides);
      if (this.isReferenceResult(result)) {
        score += 2;
      }
      if (this.isLikelyBlogHost(result.url)) {
        score -= 2.5;
      }
      if (this.isLikelyCommercialSource(result)) {
        score -= 1.5;
      }
    }

    if (explanatoryQuery) {
      score += this.docsPreferenceScore(result, queryTokens);
      if (this.isReferenceResult(result)) {
        score += 2.5;
      }
      if (this.isLikelySocialOrPersonalSource(result)) {
        score -= 3.5;
      }
      const tutorialText = `${result.title} ${result.description}`.toLowerCase();
      if (TUTORIAL_TEXT_PATTERN.test(tutorialText)) {
        score -= 0.75;
      }
    }

    if (definitionLikeQuery) {
      if (this.isDictionaryDomain(result.url) || this.isLexicalSource(result)) {
        score += 1.5;
      }

      if (this.isLikelyCommercialSource(result)) {
        score -= 3;
      }

      if (this.isEntertainmentDomain(result.url)) {
        score -= 2.5;
      }
    }

    if (broadAcronymQuery) {
      if (this.isReferenceResult(result)) {
        score += 3;
      }
      if (this.isProductResult(result)) {
        score -= 4.5;
      }
      if (this.isLikelyCommercialSource(result)) {
        score -= 2;
      }
    }

    if (hackerNewsQuery) {
      if (this.isHackerNewsResult(result)) {
        score += 5;
      }
      if (this.isMarketingHeavyResult(result)) {
        score -= 2;
      }
    }

    if (result.description.trim().length < 50) {
      score -= 0.5;
    }

    return score;
  }

  private isLikelyExplanatoryQuery(query: string): boolean {
    return EXPLANATORY_QUERY_PATTERN.test(query.trim());
  }

  private isComparisonQuery(query: string): boolean {
    return COMPARISON_QUERY_PATTERN.test(query.trim());
  }

  private extractComparisonSides(query: string): string[] {
    const normalized = query.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      return [];
    }

    const vsMatch = normalized.match(/^(.+?)\s+(?:vs|versus)\s+(.+)$/i);
    if (vsMatch?.[1] && vsMatch[2]) {
      return [vsMatch[1].trim(), vsMatch[2].trim()];
    }

    const compareMatch = normalized.match(/^(?:compare|difference between)\s+(.+?)\s+(?:and|vs|versus)\s+(.+)$/i);
    if (compareMatch?.[1] && compareMatch[2]) {
      return [compareMatch[1].trim(), compareMatch[2].trim()];
    }

    return [];
  }

  private isLikelySocialOrPersonalSource(result: SummarySource): boolean {
    const text = `${result.title} ${result.description} ${result.url}`.toLowerCase();
    if (PERSONAL_BLOG_PATTERN.test(text)) {
      return true;
    }

    try {
      const parsed = new URL(result.url);
      const hostname = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname.toLowerCase();
      if (SOCIAL_DOMAIN_PATTERN.test(hostname)) {
        return true;
      }

      const datedBlogPath = /^\/\d{4}\/\d{2}\/\d{2}\//.test(pathname);
      const highlyTrustedHost =
        REFERENCE_DOMAIN_PATTERN.test(hostname) ||
        PRODUCT_DOMAIN_PATTERN.test(hostname) ||
        hostname.endsWith('.edu') ||
        hostname.endsWith('.gov') ||
        hostname === 'github.com' ||
        hostname.endsWith('.dev');

      if (datedBlogPath && !highlyTrustedHost) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  private isBroadAcronymQuery(query: string): boolean {
    return BROAD_ACRONYM_QUERY_PATTERN.test(query.trim().toLowerCase());
  }

  private isLikelyBlogHost(urlValue: string): boolean {
    try {
      return BLOG_HOST_PATTERN.test(new URL(urlValue).hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  private isHackerNewsQuery(query: string): boolean {
    return HACKER_NEWS_QUERY_PATTERN.test(query.trim().toLowerCase());
  }

  private docsPreferenceScore(result: SummarySource, queryTokens: string[]): number {
    let hostname = '';
    let pathname = '';
    try {
      const parsed = new URL(result.url);
      hostname = parsed.hostname.toLowerCase();
      pathname = parsed.pathname.toLowerCase();
    } catch {
      return 0;
    }

    let score = 0;
    if (hostname.startsWith('docs.') || pathname.startsWith('/docs') || pathname.includes('/docs/')) {
      score += 2;
    }

    if (hostname.endsWith('.dev')) {
      score += 1.5;
    }

    if (hostname === 'github.com') {
      score += 1;
    }

    if (queryTokens.some((token) => hostname.includes(token))) {
      score += 1.5;
    }

    if (queryTokens.some((token) => pathname.includes(`/${token}`))) {
      score += 1;
    }

    return score;
  }

  private queryOverlapScore(result: SummarySource, queryTokens: string[]): number {
    if (queryTokens.length === 0) {
      return 0;
    }

    const resultTokens = this.extractMeaningfulTokens(`${result.title} ${result.description}`);
    if (resultTokens.length === 0) {
      return 0;
    }

    const set = new Set(resultTokens);
    let overlap = 0;
    for (const token of queryTokens) {
      if (set.has(token)) {
        overlap += 1;
      }
    }

    return overlap / queryTokens.length;
  }

  private authorityScore(urlValue: string): number {
    let hostname = '';
    try {
      hostname = new URL(urlValue).hostname.toLowerCase();
    } catch {
      return 0;
    }

    let score = 0;
    for (const [pattern, value] of AUTHORITY_DOMAIN_SCORES) {
      if (pattern.test(hostname)) {
        score += value;
      }
    }

    if (hostname.endsWith('.edu') || hostname.endsWith('.gov')) {
      score += 2;
    }

    return score;
  }

  private isEntertainmentDomain(urlValue: string): boolean {
    try {
      return ENTERTAINMENT_DOMAIN_PATTERN.test(new URL(urlValue).hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  private isDictionaryDomain(urlValue: string): boolean {
    try {
      return DICTIONARY_DOMAIN_PATTERN.test(new URL(urlValue).hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  private isLexicalSource(result: SummarySource): boolean {
    const text = `${result.title} ${result.description}`;
    return LEXICAL_SOURCE_TEXT_PATTERN.test(text);
  }

  private isLikelyCommercialSource(result: SummarySource): boolean {
    const text = `${result.title} ${result.description} ${result.url}`;
    return COMMERCIAL_SOURCE_TEXT_PATTERN.test(text);
  }

  private isLikelyDefinitionQuery(query: string): boolean {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    if (normalized.startsWith('define ')) {
      return true;
    }

    if (normalized.includes('definition of') || normalized.includes('meaning of')) {
      return true;
    }

    return LETTERS_ONLY_PATTERN.test(normalized);
  }

  private isLikelyAmbiguous(query: string, results: SummarySource[]): boolean {
    const queryTokens = this.extractMeaningfulTokens(query);
    if (queryTokens.length <= 1 && query.trim().length <= 3) {
      return true;
    }

    const primaryTokens = this.extractMeaningfulTokens(`${results[0]?.title ?? ''} ${results[0]?.description ?? ''}`);
    if (primaryTokens.length === 0) {
      return false;
    }

    let lowOverlapCount = 0;

    for (const result of results.slice(1)) {
      const tokens = this.extractMeaningfulTokens(`${result.title} ${result.description}`);
      if (tokens.length === 0) {
        continue;
      }

      const overlap = this.tokenOverlapRatio(primaryTokens, tokens);
      if (overlap < 0.2) {
        lowOverlapCount += 1;
      }
    }

    return lowOverlapCount >= 2;
  }

  private extractMeaningfulTokens(text: string): string[] {
    const matches = text.toLowerCase().match(TOKEN_PATTERN) ?? [];
    const unique = new Set<string>();

    for (const token of matches) {
      if (token.length <= 2 || STOP_WORDS.has(token)) {
        continue;
      }
      unique.add(token);
    }

    return [...unique];
  }

  private tokenOverlapRatio(tokensA: string[], tokensB: string[]): number {
    if (tokensA.length === 0 || tokensB.length === 0) {
      return 0;
    }

    const setB = new Set(tokensB);
    let shared = 0;

    for (const token of tokensA) {
      if (setB.has(token)) {
        shared += 1;
      }
    }

    return shared / Math.max(tokensA.length, tokensB.length);
  }

  private buildFallbackSummary(query: string, results: SummarySource[]): string | null {
    const sources = results.slice(0, 3);
    if (sources.length === 0) {
      return null;
    }

    if (this.isComparisonQuery(query)) {
      const comparisonSummary = this.buildComparisonFallbackSummary(query, sources);
      if (comparisonSummary) {
        return comparisonSummary;
      }
    }

    const leadSourcePool = (() => {
      if (this.isHackerNewsQuery(query)) {
        const hackerNewsPreferred = sources
          .filter((source) => this.isHackerNewsResult(source))
          .filter((source) => this.isInformativeFallbackSnippet(source.description));
        if (hackerNewsPreferred.length > 0) {
          return hackerNewsPreferred;
        }
      }

      if (this.isBroadAcronymQuery(query)) {
        const nonProduct = sources.filter((source) => !this.isProductResult(source));
        if (nonProduct.length > 0) {
          return nonProduct;
        }
      }

      return sources;
    })();

    const cleanedSnippets = leadSourcePool
      .map((source) => {
        const cleaned = source.description.replace(/\s+/g, ' ').trim();
        if (cleaned) {
          return cleaned;
        }
        return '';
      })
      .filter((value): value is string => value.length > 0);

    const informativeSnippets = cleanedSnippets.filter((snippet) => this.isInformativeFallbackSnippet(snippet));
    const snippetPool = informativeSnippets.length > 0 ? informativeSnippets : cleanedSnippets;
    const titleFallbackLead = this.buildTitleFallbackLead(sources);

    if (snippetPool.length === 0) {
      if (!titleFallbackLead) {
        return null;
      }
      const supportOnly = this.buildFallbackSupportSentence(query, sources);
      return [titleFallbackLead, supportOnly].filter(Boolean).join(' ');
    }

    const sentences = snippetPool
      .map((cleaned) => cleaned.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/)?.[0]?.trim() ?? '')
      .map((sentence) => sentence.replace(/\s*\.\.\.\s*$/, '').trim())
      .filter((sentence) => sentence.length >= 12 && !this.isLikelyIncompleteSentence(sentence));

    if (sentences.length === 0) {
      const fallback = snippetPool[0]?.replace(/\s*\.\.\.\s*$/, '').trim() ?? '';
      if ((!fallback || this.isLikelyIncompleteSentence(fallback)) && !titleFallbackLead) {
        return null;
      }
      const lead =
        fallback && !this.isLikelyIncompleteSentence(fallback)
          ? this.ensureSentencePunctuation(fallback)
          : titleFallbackLead;
      const supportOnly = this.buildFallbackSupportSentence(query, sources);
      return [lead, supportOnly].filter(Boolean).join(' ');
    }

    const leadSentence = sentences[0];
    if (!leadSentence) {
      return null;
    }

    const lead = this.ensureSentencePunctuation(this.rephraseFallbackLead(query, leadSentence));
    const support = this.buildFallbackSupportSentence(query, sources);
    return [lead, support].filter(Boolean).join(' ');
  }

  private isInformativeFallbackSnippet(snippet: string): boolean {
    const normalized = snippet.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return false;
    }

    if (normalized.length < 25) {
      return false;
    }

    if (LOW_INFORMATION_SNIPPET_PATTERN.test(normalized)) {
      return false;
    }

    return true;
  }

  private isLikelyIncompleteSentence(sentence: string): boolean {
    const normalized = sentence.trim().replace(/[.!?]+$/, '');
    if (!normalized) {
      return true;
    }

    return INCOMPLETE_SENTENCE_END_PATTERN.test(normalized);
  }

  private buildTitleFallbackLead(results: SummarySource[]): string | null {
    const firstTitle = results
      .map((source) => source.title?.replace(/\s+/g, ' ').trim() ?? '')
      .map((title) => title.split('|')[0]?.trim() ?? title)
      .find((title) => title.length >= 3);

    if (!firstTitle) {
      return null;
    }

    return this.ensureSentencePunctuation(`${firstTitle} is covered by multiple sources`);
  }

  private rephraseFallbackLead(query: string, sentence: string): string {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return sentence;
    }

    const escapedQuery = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const queryLeadPattern = new RegExp(`^${escapedQuery}\\b\\s*`, 'i');
    if (!queryLeadPattern.test(sentence)) {
      return sentence;
    }

    const remainder = sentence.replace(queryLeadPattern, '').trim().replace(/[.!?]+$/, '');
    if (!remainder || !/^(is|are|was|were|refers?\s+to|means?|describes?)/i.test(remainder)) {
      return sentence;
    }

    return `In general usage, ${normalizedQuery} ${remainder}.`;
  }

  private buildFallbackSupportSentence(query: string, results: SummarySource[]): string | null {
    if (results.length === 0) {
      return null;
    }

    if (/\bnews\b/i.test(query)) {
      return 'Top sources cover this topic from multiple angles.';
    }

    if (this.isComparisonQuery(query)) {
      return 'Sources distinguish their roles, tradeoffs, and typical use cases.';
    }

    const variants = [
      'Reference sources generally describe this concept in similar terms.',
      'Across reference sources, the core meaning remains consistent.',
      'Authoritative references present a broadly consistent description.',
    ];

    const seed = query
      .trim()
      .toLowerCase()
      .split('')
      .reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const index = seed % variants.length;
    return variants[index] ?? variants[0] ?? null;
  }

  private buildComparisonFallbackSummary(query: string, results: SummarySource[]): string | null {
    const sides = this.extractComparisonSides(query);
    if (sides.length !== 2) {
      return null;
    }

    const [left, right] = sides;
    if (!left || !right) {
      return null;
    }

    const leftDescriptor = this.extractComparisonDescriptor(left, results);
    const rightDescriptor = this.extractComparisonDescriptor(right, results);

    if (leftDescriptor && rightDescriptor) {
      return [
        `${left} ${leftDescriptor}, while ${right} ${rightDescriptor}.`,
        this.buildFallbackSupportSentence(query, results),
      ]
        .filter(Boolean)
        .join(' ');
    }

    const combinedSource = results.find((result) => this.comparisonCoverageScore(result, sides) >= 4);
    const combinedSentence = combinedSource
      ? combinedSource.description.match(SENTENCE_SPLIT_PATTERN)?.[0]?.replace(/\s*\.\.\.\s*$/, '').trim() ?? ''
      : '';

    if (combinedSentence && !this.isLikelyIncompleteSentence(combinedSentence)) {
      return [this.ensureSentencePunctuation(combinedSentence), this.buildFallbackSupportSentence(query, results)]
        .filter(Boolean)
        .join(' ');
    }

    return `${left} and ${right} are related but serve different roles. ${this.buildFallbackSupportSentence(query, results)}`;
  }

  private extractComparisonDescriptor(entity: string, results: SummarySource[]): string | null {
    const escapedEntity = entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const normalizedEntity = entity.trim().toLowerCase();

    for (const result of results) {
      const sentences = result.description.match(SENTENCE_SPLIT_PATTERN) ?? [result.description];
      for (const sentence of sentences) {
        const normalized = sentence.replace(/\s+/g, ' ').trim().replace(/\s*\.\.\.\s*$/, '');
        if (!normalized || !new RegExp(`\\b${escapedEntity}\\b`, 'i').test(normalized)) {
          continue;
        }

        const colonMatch = normalized.match(new RegExp(`^${escapedEntity}\\s*:\\s*(.+)$`, 'i'));
        if (colonMatch?.[1]) {
          const descriptor = colonMatch[1].trim().replace(/[.!?]+$/, '');
          if (descriptor) {
            return descriptor.charAt(0).toLowerCase() + descriptor.slice(1);
          }
        }

        const verbMatch = normalized.match(
          new RegExp(`^${escapedEntity}\\s+(is|are|refers to|means|involves|uses?)\\s+(.+)$`, 'i'),
        );
        if (verbMatch?.[1] && verbMatch[2]) {
          const descriptor = `${verbMatch[1].toLowerCase()} ${verbMatch[2].trim().replace(/[.!?]+$/, '')}`;
          return descriptor;
        }

        const lower = normalized.toLowerCase();
        const index = lower.indexOf(normalizedEntity);
        if (index === 0) {
          const remainder = normalized.slice(entity.length).trim().replace(/^[,:-]\s*/, '').replace(/[.!?]+$/, '');
          if (remainder) {
            return remainder.charAt(0).toLowerCase() + remainder.slice(1);
          }
        }
      }
    }

    return null;
  }

  private comparisonCoverageScore(result: SummarySource, sides: string[]): number {
    if (sides.length !== 2) {
      return 0;
    }

    const text = `${result.title} ${result.description}`.toLowerCase();
    const [left = '', right = ''] = sides.map((side) => side.toLowerCase());
    const mentionsLeft = text.includes(left);
    const mentionsRight = text.includes(right);

    if (mentionsLeft && mentionsRight) {
      return 4;
    }

    if (mentionsLeft || mentionsRight) {
      return 1;
    }

    return 0;
  }

  private comparisonEvidenceCoverageScore(source: EvidenceSourceItem, sides: string[]): number {
    return this.comparisonCoverageScore(
      {
        id: source.id ?? '',
        title: source.title,
        url: source.url,
        description: source.snippet,
      },
      sides,
    );
  }

  private toNaturalSummary(
    summary: string | null,
    maxSentences: number,
    query: string,
    definitionStyleQuery: boolean,
  ): string | null {
    if (!summary) {
      return null;
    }

    const normalized = summary
      .replace(CITATION_MARKER_PATTERN, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) {
      return null;
    }

    const sentences = normalized.match(SENTENCE_SPLIT_PATTERN) ?? [normalized];
    const limitedSentences = sentences
      .slice(0, maxSentences)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);

    const refinedSentences = definitionStyleQuery
      ? this.refineDefinitionStyleSummary(limitedSentences, query).slice(0, maxSentences)
      : limitedSentences;

    return refinedSentences.join(' ');
  }

  private refineDefinitionStyleSummary(sentences: string[], query: string): string[] {
    const deduped: string[] = [];
    const normalizedQuery = query.trim();

    for (const sentence of sentences) {
      const normalizedSentence = this.normalizeDefinitionStyleSentence(sentence, normalizedQuery);
      if (!normalizedSentence) {
        continue;
      }

      const isNearDuplicate = deduped.some(
        (existing) => this.isDuplicateDefinitionSentence(existing, normalizedSentence, normalizedQuery),
      );
      if (isNearDuplicate) {
        continue;
      }

      deduped.push(normalizedSentence);
    }

    return deduped;
  }

  private normalizeDefinitionStyleSentence(sentence: string, query: string): string {
    const normalized = sentence.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return '';
    }

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const dictionaryMeaningPattern = new RegExp(`^the meaning of\\s+${escapedQuery}\\s+is\\s+`, 'i');
    if (dictionaryMeaningPattern.test(normalized)) {
      const remainder = normalized.replace(dictionaryMeaningPattern, '').trim();
      if (!remainder) {
        return '';
      }

      return this.ensureSentencePunctuation(`In common usage, ${query} means ${remainder}`);
    }

    const appositivePattern = new RegExp(`^(${escapedQuery}),\\s*`, 'i');
    if (appositivePattern.test(normalized)) {
      const remainder = normalized.replace(appositivePattern, '').trim();
      if (!remainder) {
        return normalized;
      }

      const needsArticle = /^(science|study|field|branch|discipline|term)\b/i.test(remainder);
      const prefix = needsArticle ? `${query} is the ` : `${query} is `;
      return this.ensureSentencePunctuation(`${prefix}${remainder}`);
    }

    return this.ensureSentencePunctuation(normalized);
  }

  private ensureSentencePunctuation(sentence: string): string {
    const trimmed = sentence.trim();
    if (!trimmed) {
      return '';
    }

    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  }

  private sentenceSimilarity(left: string, right: string): number {
    const leftTokens = this.extractMeaningfulTokens(left);
    const rightTokens = this.extractMeaningfulTokens(right);
    if (leftTokens.length === 0 || rightTokens.length === 0) {
      return 0;
    }

    const leftSet = new Set(leftTokens);
    const rightSet = new Set(rightTokens);
    let shared = 0;

    for (const token of leftSet) {
      if (rightSet.has(token)) {
        shared += 1;
      }
    }

    return shared / Math.max(leftSet.size, rightSet.size);
  }

  private sharedTokenCount(left: string, right: string): number {
    const leftTokens = this.extractMeaningfulTokens(left);
    const rightTokens = this.extractMeaningfulTokens(right);
    if (leftTokens.length === 0 || rightTokens.length === 0) {
      return 0;
    }

    const rightSet = new Set(rightTokens);
    let shared = 0;
    for (const token of new Set(leftTokens)) {
      if (rightSet.has(token)) {
        shared += 1;
      }
    }

    return shared;
  }

  private isDuplicateDefinitionSentence(left: string, right: string, query: string): boolean {
    const similarity = this.sentenceSimilarity(left, right);
    if (similarity >= 0.7) {
      return true;
    }

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return false;
    }

    const leftLower = left.toLowerCase();
    const rightLower = right.toLowerCase();
    const bothLeadWithQuery =
      (leftLower.startsWith(`${normalizedQuery} is `) || leftLower.startsWith(`${normalizedQuery},`)) &&
      (rightLower.startsWith(`${normalizedQuery} is `) || rightLower.startsWith(`${normalizedQuery},`));

    return bothLeadWithQuery && (similarity >= 0.45 || this.sharedTokenCount(left, right) >= 4);
  }

  private extractClaims(summary: string | null, maxSentences: number): string[] {
    if (!summary) {
      return [];
    }

    const lines = summary
      .split('\n')
      .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
      .filter((line) => line.length > 0);

    const candidates =
      lines.length > 1
        ? lines
        : (summary.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [summary]);

    const claims: string[] = [];
    for (const candidate of candidates) {
      const normalized = this.normalizeClaimCandidate(candidate);
      if (!normalized) {
        continue;
      }

      if (SUPPORT_SENTENCE_PATTERN.test(normalized)) {
        continue;
      }

      if (this.isLikelyTruncatedFragment(normalized)) {
        continue;
      }

      if (this.shouldMergeIntoPreviousClaim(normalized)) {
        if (claims.length > 0) {
          const previous = claims[claims.length - 1];
          if (previous) {
            claims[claims.length - 1] = this.mergeClaimFragment(previous, normalized);
          }
        }
        continue;
      }

      if (!this.isLikelyWellFormedClaim(normalized)) {
        if (claims.length > 0) {
          const previous = claims[claims.length - 1];
          if (previous) {
            claims[claims.length - 1] = this.mergeClaimFragment(previous, normalized);
          }
        }
        continue;
      }

      claims.push(normalized);
      if (claims.length >= maxSentences) {
        break;
      }
    }

    return claims
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);
  }

  private filterRedundantClaims(summary: string | null, claims: string[]): string[] {
    if (!summary || claims.length !== 1) {
      return claims;
    }

    const supportSentences = summary
      .match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)
      ?.map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0 && SUPPORT_SENTENCE_PATTERN.test(sentence)) ?? [];
    if (supportSentences.length === 0) {
      return claims;
    }

    const [onlyClaim] = claims;
    if (!onlyClaim) {
      return claims;
    }

    const substantiveSummaryClaims = this.extractClaims(summary, 3);
    if (substantiveSummaryClaims.length !== 1) {
      return claims;
    }

    const [onlySummaryClaim] = substantiveSummaryClaims;
    if (!onlySummaryClaim) {
      return claims;
    }

    const normalizedClaim = onlyClaim.trim().toLowerCase();
    const normalizedSummaryClaim = onlySummaryClaim.trim().toLowerCase();
    if (normalizedClaim === normalizedSummaryClaim) {
      return [];
    }

    const similarity = this.sentenceSimilarity(normalizedClaim, normalizedSummaryClaim);
    if (similarity >= 0.92 && this.sharedTokenCount(normalizedClaim, normalizedSummaryClaim) >= 6) {
      return [];
    }

    return claims;
  }

  private normalizeClaimCandidate(candidate: string): string {
    return candidate.replace(/\s+/g, ' ').trim();
  }

  private isLikelyTruncatedFragment(candidate: string): boolean {
    if (candidate.includes('...')) {
      return true;
    }

    if (this.isLikelyIncompleteSentence(candidate)) {
      return true;
    }

    return /\b(not|only|such as|including)\s*$/i.test(candidate);
  }

  private shouldMergeIntoPreviousClaim(candidate: string): boolean {
    if (!candidate) {
      return true;
    }

    if (LEADING_FRAGMENT_PUNCTUATION_PATTERN.test(candidate)) {
      return true;
    }

    const firstWord = candidate.match(/^[a-z]+/)?.[0] ?? '';
    return firstWord.length > 0 && LEADING_FRAGMENT_CONNECTOR_PATTERN.test(firstWord);
  }

  private isLikelyWellFormedClaim(candidate: string): boolean {
    const wordCount = candidate.match(/\b[\w'-]+\b/g)?.length ?? 0;
    if (wordCount < MIN_CLAIM_WORDS) {
      return false;
    }

    if (COMMON_VERB_PATTERN.test(candidate)) {
      return true;
    }

    return wordCount <= 5;
  }

  private mergeClaimFragment(previousClaim: string, fragment: string): string {
    const cleanedFragment = fragment
      .replace(/^[,;:\-–—\s]+/, '')
      .replace(/^(and|or|but|so|yet)\b\s*/i, '')
      .trim();
    if (!cleanedFragment) {
      return previousClaim;
    }

    const base = previousClaim.trim().replace(/[.!?]+$/, '');
    const suffix = /[.!?]$/.test(cleanedFragment) ? cleanedFragment : `${cleanedFragment}.`;
    return `${base}, ${suffix}`;
  }

  private mapClaimsToEvidence(
    claimTexts: string[],
    sources: EvidenceSourceItem[],
    broadAcronymQuery: boolean,
  ): SummaryClaim[] {
    if (claimTexts.length === 0) {
      return [];
    }

    let previousClaimEvidenceKeys = new Set<string>();

    return claimTexts.map((text, index) => ({
      id: `claim-${index + 1}`,
      text,
      evidence: (() => {
        const evidence = this.selectEvidenceForClaim(
          text,
          sources,
          previousClaimEvidenceKeys,
          broadAcronymQuery,
        );
        previousClaimEvidenceKeys = new Set(evidence.map((item) => this.sourceKey(item)));
        return evidence;
      })(),
    }));
  }

  private selectEvidenceForClaim(
    claimText: string,
    sources: EvidenceSourceItem[],
    previousClaimEvidenceKeys: Set<string>,
    broadAcronymQuery = false,
  ): EvidenceSourceItem[] {
    if (sources.length === 0) {
      return [];
    }

    const claimTokens = this.extractMeaningfulTokens(claimText);
    const ranked = sources
      .map((source) => ({
        overlap: this.tokenOverlapRatio(
          claimTokens,
          this.extractMeaningfulTokens(`${source.title} ${source.snippet} ${source.domain}`),
        ),
        source,
        score:
          this.tokenOverlapRatio(
            claimTokens,
            this.extractMeaningfulTokens(`${source.title} ${source.snippet} ${source.domain}`),
          ) * 10 +
          this.evidenceSourceQualityScore(source, broadAcronymQuery),
      }))
      .sort((a, b) => b.score - a.score || a.source.sourceIndex - b.source.sourceIndex);

    const informativeRanked = ranked.filter((item) => !this.isLowInformationEvidenceSource(item.source));
    const rankedPool = informativeRanked.length > 0 ? informativeRanked : ranked;
    const strongestScore = ranked[0]?.score ?? 0;
    const secondScore = ranked[1]?.score ?? 0;
    const maxEvidence =
      strongestScore >= 4 && strongestScore - secondScore >= 1
        ? 2
        : Math.min(2, sources.length);

    const overlapFiltered = rankedPool.filter((item) => item.overlap >= MIN_CLAIM_EVIDENCE_OVERLAP);
    const candidatePool = overlapFiltered.length > 0 ? overlapFiltered : rankedPool;
    const fresh = candidatePool.filter((item) => !previousClaimEvidenceKeys.has(this.sourceKey(item.source)));
    const pool = fresh.length > 0 ? fresh : rankedPool;
    return pool.slice(0, maxEvidence).map((item) => item.source);
  }

  private toEvidenceSource(source: SummarySource, sourceIndex: number): EvidenceSourceItem {
    let domain = '';
    try {
      domain = new URL(source.url).hostname;
    } catch {
      domain = '';
    }

    return {
      id: `src-${sourceIndex}`,
      title: source.title,
      url: source.url,
      domain,
      snippet: source.description,
      sourceType: 'web',
      sourceIndex,
    };
  }

  private sourceKey(source: EvidenceSourceItem): string {
    return source.url || `${source.title}|${source.sourceIndex}`;
  }

  private evidenceSourceQualityScore(source: EvidenceSourceItem, broadAcronymQuery = false): number {
    let score = 0;
    if (source.url) {
      score += this.authorityScore(source.url);
      if (this.isEntertainmentDomain(source.url)) {
        score -= 2;
      }
    }

    const text = `${source.title} ${source.snippet}`.toLowerCase();
    if (COMMERCIAL_SOURCE_TEXT_PATTERN.test(text)) {
      score -= 2;
    }
    if (this.isMarketingHeavyText(text)) {
      score -= 2.5;
    }
    if (LEXICAL_SOURCE_TEXT_PATTERN.test(text)) {
      score += 1;
    }
    if (this.isReferenceSource(source)) {
      score += 3;
    }
    if (this.isProductSource(source)) {
      score -= broadAcronymQuery ? 5 : 1.5;
    }
    if (this.isLowInformationEvidenceSource(source)) {
      score -= 4;
    }

    return score;
  }

  private isLowInformationEvidenceSource(source: EvidenceSourceItem): boolean {
    const text = `${source.title} ${source.snippet}`.replace(/\s+/g, ' ').trim();
    if (!text) {
      return true;
    }

    return LOW_INFORMATION_SNIPPET_PATTERN.test(text) || text.length < 25;
  }

  private selectDisplaySources(sources: EvidenceSourceItem[], query: string): EvidenceSourceItem[] {
    if (sources.length === 0) {
      return [];
    }

    const broadAcronymQuery = this.isBroadAcronymQuery(query);
    const technicalQuery = this.isLikelyTechnicalQuery(query);
    const explanatoryQuery = this.isLikelyExplanatoryQuery(query);
    const comparisonQuery = this.isComparisonQuery(query);
    const comparisonSides = this.extractComparisonSides(query);
    const queryTokens = this.extractMeaningfulTokens(query);
    const deduped = new Map<string, EvidenceSourceItem>();

    for (const source of sources) {
      const key = this.sourceKey(source);
      if (!deduped.has(key)) {
        deduped.set(key, source);
      }
    }

    const ranked = [...deduped.values()]
      .map((source) => ({
        source,
        score:
          this.tokenOverlapRatio(
            queryTokens,
            this.extractMeaningfulTokens(`${source.title} ${source.snippet} ${source.domain}`),
          ) * 10 +
          this.evidenceSourceQualityScore(source, broadAcronymQuery) +
          (explanatoryQuery && this.isReferenceSource(source) ? 2.5 : 0) +
          (explanatoryQuery && this.isLikelySocialOrPersonalEvidenceSource(source) ? -3.5 : 0) +
          (comparisonQuery ? this.comparisonEvidenceCoverageScore(source, comparisonSides) : 0) +
          (comparisonQuery && this.isReferenceSource(source) ? 2 : 0) +
          (comparisonQuery && this.isLikelyBlogHost(source.url) ? -2.5 : 0),
      }))
      .sort((a, b) => b.score - a.score || a.source.sourceIndex - b.source.sourceIndex)
      .map((item) => item.source);

    const hackerNewsQuery = this.isHackerNewsQuery(query);
    let selected = ranked.slice(0, MAX_SUMMARY_DISPLAY_SOURCES);
    if (broadAcronymQuery) {
      selected = this.limitProductSources(selected, ranked, 0);
      selected = this.ensureReferenceSourceInTopN(selected, ranked, 2);
      selected = this.preferNonProductSources(selected, ranked);
      selected = this.trimProductSourcesForBroadQuery(selected);
    }
    if (technicalQuery) {
      selected = this.limitMarketingSources(selected, ranked, 0);
    }
    if (explanatoryQuery) {
      selected = this.limitSocialOrPersonalSources(selected, ranked, 0);
      selected = this.ensureReferenceSourceInTopN(selected, ranked, 2);
    }
    if (comparisonQuery) {
      selected = this.limitSocialOrPersonalSources(selected, ranked, 0);
      selected = this.ensureReferenceSourceInTopN(selected, ranked, 2);
    }
    if (hackerNewsQuery) {
      selected = this.ensurePreferredHackerNewsSource(selected, ranked);
    }

    if (selected.length === 0) {
      return selected;
    }

    if (selected.some((source) => this.isReferenceSource(source))) {
      return selected;
    }

    const bestReferenceCandidate = ranked.find((source) => this.isReferenceSource(source));
    if (!bestReferenceCandidate) {
      return selected;
    }

    let replacementIndex = selected.length - 1;
    for (let i = selected.length - 1; i >= 0; i -= 1) {
      const source = selected[i];
      if (source && this.isProductSource(source)) {
        replacementIndex = i;
        break;
      }
    }
    selected[replacementIndex] = bestReferenceCandidate;
    return selected;
  }

  private ensurePreferredHackerNewsSource(
    selected: EvidenceSourceItem[],
    ranked: EvidenceSourceItem[],
  ): EvidenceSourceItem[] {
    const output = [...selected];
    if (output.some((source) => this.isHackerNewsSource(source))) {
      return output;
    }

    const preferred = ranked.find((source) => this.isHackerNewsSource(source));
    if (!preferred) {
      return output;
    }

    output[output.length - 1] = preferred;
    return output;
  }

  private ensureReferenceSourceInTopN(
    selected: EvidenceSourceItem[],
    ranked: EvidenceSourceItem[],
    topN: number,
  ): EvidenceSourceItem[] {
    const output = [...selected];
    if (output.slice(0, topN).some((source) => this.isReferenceSource(source))) {
      return output;
    }

    const referenceCandidate = ranked.find(
      (source) =>
        this.isReferenceSource(source) && !output.some((current) => this.sourceKey(current) === this.sourceKey(source)),
    );
    if (!referenceCandidate) {
      return output;
    }

    const replaceIndex = Math.min(Math.max(topN - 1, 0), output.length - 1);
    output[replaceIndex] = referenceCandidate;
    return output;
  }

  private limitProductSources(
    selected: EvidenceSourceItem[],
    ranked: EvidenceSourceItem[],
    maxProductSources: number,
  ): EvidenceSourceItem[] {
    const output = [...selected];
    let productCount = output.filter((source) => this.isProductSource(source)).length;
    if (productCount <= maxProductSources) {
      return output;
    }

    const replacementCandidates = ranked.filter(
      (source) =>
        !this.isProductSource(source) && !output.some((current) => this.sourceKey(current) === this.sourceKey(source)),
    );

    for (let i = output.length - 1; i >= 0 && productCount > maxProductSources; i -= 1) {
      const current = output[i];
      if (!current || !this.isProductSource(current)) {
        continue;
      }

      const replacement = replacementCandidates.shift();
      if (!replacement) {
        break;
      }
      output[i] = replacement;
      productCount -= 1;
    }

    return output;
  }

  private preferNonProductSources(
    selected: EvidenceSourceItem[],
    ranked: EvidenceSourceItem[],
  ): EvidenceSourceItem[] {
    const output = [...selected];
    const replacementCandidates = ranked.filter(
      (source) =>
        !this.isProductSource(source) &&
        !output.some((current) => this.sourceKey(current) === this.sourceKey(source)),
    );

    for (let i = output.length - 1; i >= 0; i -= 1) {
      const current = output[i];
      if (!current || !this.isProductSource(current)) {
        continue;
      }

      const replacement = replacementCandidates.shift();
      if (!replacement) {
        break;
      }
      output[i] = replacement;
    }

    return output;
  }

  private trimProductSourcesForBroadQuery(selected: EvidenceSourceItem[]): EvidenceSourceItem[] {
    const nonProductSources = selected.filter((source) => !this.isProductSource(source));
    if (nonProductSources.length >= 2) {
      return nonProductSources;
    }

    return selected;
  }

  private limitMarketingSources(
    selected: EvidenceSourceItem[],
    ranked: EvidenceSourceItem[],
    maxMarketingSources: number,
  ): EvidenceSourceItem[] {
    const output = [...selected];
    let marketingCount = output.filter((source) => this.isMarketingHeavySource(source)).length;
    if (marketingCount <= maxMarketingSources) {
      return output;
    }

    const replacementCandidates = ranked.filter(
      (source) =>
        !this.isMarketingHeavySource(source) &&
        !output.some((current) => this.sourceKey(current) === this.sourceKey(source)),
    );

    for (let i = output.length - 1; i >= 0 && marketingCount > maxMarketingSources; i -= 1) {
      const current = output[i];
      if (!current || !this.isMarketingHeavySource(current)) {
        continue;
      }

      const replacement = replacementCandidates.shift();
      if (!replacement) {
        break;
      }
      output[i] = replacement;
      marketingCount -= 1;
    }

    return output;
  }

  private limitSocialOrPersonalSources(
    selected: EvidenceSourceItem[],
    ranked: EvidenceSourceItem[],
    maxSocialOrPersonalSources: number,
  ): EvidenceSourceItem[] {
    const output = [...selected];
    let count = output.filter((source) => this.isLikelySocialOrPersonalEvidenceSource(source)).length;
    if (count <= maxSocialOrPersonalSources) {
      return output;
    }

    const replacementCandidates = ranked.filter(
      (source) =>
        !this.isLikelySocialOrPersonalEvidenceSource(source) &&
        !output.some((current) => this.sourceKey(current) === this.sourceKey(source)),
    );

    for (let i = output.length - 1; i >= 0 && count > maxSocialOrPersonalSources; i -= 1) {
      const current = output[i];
      if (!current || !this.isLikelySocialOrPersonalEvidenceSource(current)) {
        continue;
      }

      const replacement = replacementCandidates.shift();
      if (!replacement) {
        break;
      }
      output[i] = replacement;
      count -= 1;
    }

    return output;
  }

  private isReferenceResult(result: SummarySource): boolean {
    return this.isReferenceSource(this.toEvidenceSource(result, 0));
  }

  private isProductResult(result: SummarySource): boolean {
    return this.isProductSource(this.toEvidenceSource(result, 0));
  }

  private ensureReferenceResultForBroadAcronym(
    selected: SummarySource[],
    ranked: SummarySource[],
  ): SummarySource[] {
    if (selected.length === 0) {
      return selected;
    }

    if (selected.some((result) => this.isReferenceResult(result))) {
      return selected;
    }

    const referenceCandidate = ranked.find(
      (result) =>
        this.isReferenceResult(result) &&
        !selected.some((current) => current.url === result.url),
    );
    if (!referenceCandidate) {
      return selected;
    }

    const output = [...selected];
    output[output.length - 1] = referenceCandidate;
    return output;
  }

  private isReferenceSource(source: EvidenceSourceItem): boolean {
    if (source.url) {
      try {
        const hostname = new URL(source.url).hostname.toLowerCase();
        if (REFERENCE_DOMAIN_PATTERN.test(hostname) || hostname.endsWith('.edu') || hostname.endsWith('.gov')) {
          return true;
        }
      } catch {}
    }

    const text = `${source.title} ${source.snippet}`.toLowerCase();
    return /\b(encyclopedia|research|study|paper|journal|scientific)\b/.test(text);
  }

  private isLikelySocialOrPersonalEvidenceSource(source: EvidenceSourceItem): boolean {
    return this.isLikelySocialOrPersonalSource({
      id: source.id ?? '',
      title: source.title,
      url: source.url,
      description: source.snippet,
    });
  }

  private isProductSource(source: EvidenceSourceItem): boolean {
    if (source.url) {
      try {
        const hostname = new URL(source.url).hostname.toLowerCase();
        if (PRODUCT_DOMAIN_PATTERN.test(hostname)) {
          return true;
        }

        if (
          hostname.endsWith('.ai') &&
          /\b(chat|agent|assistant|copilot|model)\b/.test(`${source.title} ${source.snippet}`.toLowerCase())
        ) {
          return true;
        }
      } catch {}
    }

    const text = `${source.title} ${source.snippet}`.toLowerCase();
    return /\b(assistant|chatbot|official site|pricing|plans|try now|sign up)\b/.test(text);
  }

  private isHackerNewsSource(source: EvidenceSourceItem): boolean {
    if (!source.url) {
      return false;
    }

    try {
      const hostname = new URL(source.url).hostname.toLowerCase();
      return hostname === 'news.ycombinator.com';
    } catch {
      return false;
    }
  }

  private isHackerNewsResult(result: SummarySource): boolean {
    return this.isHackerNewsSource(this.toEvidenceSource(result, 0));
  }

  private isMarketingHeavyResult(result: SummarySource): boolean {
    const text = `${result.title} ${result.description}`.toLowerCase();
    return this.isMarketingHeavyText(text);
  }

  private isMarketingHeavySource(source: EvidenceSourceItem): boolean {
    return this.isMarketingHeavyText(`${source.title} ${source.snippet}`.toLowerCase());
  }

  private isLikelyTechnicalQuery(query: string): boolean {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    if (this.isLikelyDefinitionQuery(normalized)) {
      return false;
    }

    return TECHNICAL_QUERY_HINT_PATTERN.test(normalized);
  }

  private shouldUseFallbackSummary(summary: string | null, query: string): boolean {
    if (!summary) {
      return false;
    }

    if (!this.isLikelyTechnicalQuery(query)) {
      return false;
    }

    return this.isMarketingHeavyText(summary);
  }

  private isMarketingHeavyText(text: string): boolean {
    return MARKETING_HEAVY_TEXT_PATTERN.test(text.toLowerCase());
  }
}
