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
const EXPLANATORY_QUERY_PATTERN = /^(what is|what are|what does|explain)\b/i;
const TUTORIAL_TEXT_PATTERN = /\b(introduction|tutorial|guide|practical guide|get started|getting started)\b/i;
const BROAD_ACRONYM_QUERY_PATTERN = /^(ai|a\.i\.|ml|llm|nlp)$/i;
const HACKER_NEWS_QUERY_PATTERN = /^(hacker news|hn)$/i;
const MARKETING_HEAVY_TEXT_PATTERN = /\b(#1|trusted source|top platform|real-time updates|actionable insights)\b/i;

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
          return this.buildLocalFallbackResponse(
            candidateResults,
            rankedFallbackSources,
            maxSentences,
            trimmedQuery,
            definitionStyleQuery,
          );
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
          const summaryText = normalizedSummary ?? fallbackSummary;
          const claimTexts = this.extractClaims(summaryText, maxSentences);
          if (claimTexts.length === 0) {
            const response = {
              summary: summaryText,
              error: null,
              sources: groundedSources,
              claims: [],
            };
            this.writeSummaryCache(cacheKey, response);
            return response;
          }

          const response = {
            summary: claimTexts.join(' '),
            error: null,
            sources: groundedSources,
            claims: this.mapClaimsToEvidence(claimTexts, groundedSources, broadAcronymQuery),
          };
          this.writeSummaryCache(cacheKey, response);
          return response;
      }
    } catch {
      const response = this.buildLocalFallbackResponse(
        candidateResults,
        rankedFallbackSources,
        maxSentences,
        trimmedQuery,
        definitionStyleQuery,
      );
      this.writeSummaryCache(cacheKey, response);
      return response;
    }
    }

    if (!this.provider) {
      const response = {
        summary: this.buildFallbackSummary(trimmedQuery, candidateResults),
        error: null,
        sources: rankedFallbackSources,
        claims: this.mapClaimsToEvidence(
          this.extractClaims(
            this.buildFallbackSummary(trimmedQuery, candidateResults),
            MAX_DEFINITION_STYLE_SUMMARY_SENTENCES,
          ),
          rankedFallbackSources,
          broadAcronymQuery,
        ),
      };
      this.writeSummaryCache(cacheKey, response);
      return response;
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
      const claimTexts = this.extractClaims(normalizedSummary, maxSentences);

      const response = {
        summary: normalizedSummary,
        error: claimTexts.length === 0 ? 'Model output could not be structured into claims.' : null,
        sources: rankedFallbackSources,
        claims: this.mapClaimsToEvidence(claimTexts, rankedFallbackSources, broadAcronymQuery),
      };
      this.writeSummaryCache(cacheKey, response);
      return response;
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
      this.writeSummaryCache(cacheKey, response);
      return response;
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

  private selectSummaryResults(query: string, results: SummarySource[], definitionLikeQuery: boolean): SummarySource[] {
    const deduped: SummarySource[] = [];
    const seenUrls = new Set<string>();
    const queryTokens = this.extractMeaningfulTokens(query);
    const explanatoryQuery = this.isLikelyExplanatoryQuery(query);
    const broadAcronymQuery = this.isBroadAcronymQuery(query);
    const hackerNewsQuery = this.isHackerNewsQuery(query);

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

    const filteredForIntent = this.filterByQueryIntent(deduped, definitionLikeQuery);

    const scored = filteredForIntent
      .map((result, index) => ({
        result,
        index,
        score: this.scoreSource(
          result,
          queryTokens,
          definitionLikeQuery,
          explanatoryQuery,
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
    const claimTexts = this.extractClaims(summary, maxSentences);
    return {
      summary,
      error: null,
      sources: rankedFallbackSources,
      claims: this.mapClaimsToEvidence(claimTexts, rankedFallbackSources, this.isBroadAcronymQuery(query)),
    };
  }

  private filterByQueryIntent(results: SummarySource[], definitionLikeQuery: boolean): SummarySource[] {
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
    broadAcronymQuery: boolean,
    hackerNewsQuery: boolean,
  ): number {
    let score = 0;
    score += this.queryOverlapScore(result, queryTokens) * 8;
    score += this.authorityScore(result.url);

    if (explanatoryQuery) {
      score += this.docsPreferenceScore(result, queryTokens);
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
        score -= 2.5;
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

  private isBroadAcronymQuery(query: string): boolean {
    return BROAD_ACRONYM_QUERY_PATTERN.test(query.trim().toLowerCase());
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
    if (LEXICAL_SOURCE_TEXT_PATTERN.test(text)) {
      score += 1;
    }
    if (this.isReferenceSource(source)) {
      score += 3;
    }
    if (this.isProductSource(source)) {
      score -= broadAcronymQuery ? 3.5 : 1.5;
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
          this.evidenceSourceQualityScore(source, broadAcronymQuery),
      }))
      .sort((a, b) => b.score - a.score || a.source.sourceIndex - b.source.sourceIndex)
      .map((item) => item.source);

    const hackerNewsQuery = this.isHackerNewsQuery(query);
    let selected = ranked.slice(0, MAX_SUMMARY_DISPLAY_SOURCES);
    if (broadAcronymQuery) {
      selected = this.limitProductSources(selected, ranked, 1);
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

  private isProductSource(source: EvidenceSourceItem): boolean {
    if (source.url) {
      try {
        const hostname = new URL(source.url).hostname.toLowerCase();
        if (PRODUCT_DOMAIN_PATTERN.test(hostname)) {
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
    return MARKETING_HEAVY_TEXT_PATTERN.test(text);
  }
}
