import { OpenAiSummarizationProvider } from '../providers/llm/openai.provider.js';
import type { LlmSummarizationProvider, SummarySource } from '../providers/llm/provider.interface.js';

const MAX_SUMMARY_CONTEXT_RESULTS = 5;
const MAX_SUMMARY_DISPLAY_SOURCES = 3;
const MAX_SUMMARY_SENTENCES = 4;
const MAX_DEFINITION_STYLE_SUMMARY_SENTENCES = 3;
const TOKEN_PATTERN = /[a-z0-9]+/g;
const CITATION_MARKER_PATTERN = /\s*\[\d+\]/g;
const LETTERS_ONLY_PATTERN = /^[a-zA-Z]+$/;
const WEAK_SOURCE_TEXT_PATTERN =
  /\b(sign in|signin|log in|login|register|create account|subscribe|cookie policy|privacy policy|terms of service|access denied|404)\b/i;
const ENTERTAINMENT_DOMAIN_PATTERN =
  /(?:^|\.)((youtube|imdb|spotify|netflix|hulu|genius|fandom|songfacts)\.com)$/i;
const DICTIONARY_DOMAIN_PATTERN =
  /(?:^|\.)((dictionaryapi\.dev|dictionary\.com|merriam-webster\.com|cambridge\.org|oxfordlearnersdictionaries\.com|vocabulary\.com))$/i;
const AUTHORITY_DOMAIN_SCORES: Array<[RegExp, number]> = [
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

export interface SummarizationResult {
  summary: string | null;
  error: string | null;
  sources: Array<{ title: string; url: string }>;
}

export interface SummarizationServiceOptions {
  provider?: LlmSummarizationProvider;
  openAiApiKey?: string;
}

export class SummarizationService {
  private readonly provider: LlmSummarizationProvider | null;

  constructor(options: SummarizationServiceOptions = {}) {
    this.provider =
      options.provider ??
      (options.openAiApiKey || process.env.OPENAI_API_KEY
        ? new OpenAiSummarizationProvider({
            apiKey: options.openAiApiKey ?? process.env.OPENAI_API_KEY ?? '',
          })
        : null);
  }

  async summarize(query: string, results: SummarySource[]): Promise<SummarizationResult> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return { summary: null, error: null, sources: [] };
    }

    const definitionStyleQuery = this.isLikelyDefinitionQuery(trimmedQuery);
    const candidateResults = this.selectSummaryResults(trimmedQuery, results, definitionStyleQuery);
    if (candidateResults.length === 0) {
      return { summary: null, error: null, sources: [] };
    }

    const sources = candidateResults.slice(0, MAX_SUMMARY_DISPLAY_SOURCES).map((result) => ({
      title: result.title,
      url: result.url,
    }));

    if (!this.provider) {
      return {
        summary: this.buildFallbackSummary(candidateResults),
        error: null,
        sources,
      };
    }

    try {
      const ambiguousQuery = this.isLikelyAmbiguous(trimmedQuery, candidateResults);
      const summary = await this.provider.summarize({
        query: trimmedQuery,
        results: candidateResults,
        ambiguousQuery,
        definitionStyleQuery,
      });

      return {
        summary: this.toNaturalSummary(
          summary,
          definitionStyleQuery ? MAX_DEFINITION_STYLE_SUMMARY_SENTENCES : MAX_SUMMARY_SENTENCES,
        ),
        error: null,
        sources,
      };
    } catch {
      return {
        summary: this.toNaturalSummary(
          this.buildFallbackSummary(candidateResults),
          definitionStyleQuery ? MAX_DEFINITION_STYLE_SUMMARY_SENTENCES : MAX_SUMMARY_SENTENCES,
        ),
        error: null,
        sources,
      };
    }
  }

  private selectSummaryResults(query: string, results: SummarySource[], definitionLikeQuery: boolean): SummarySource[] {
    const deduped: SummarySource[] = [];
    const seenUrls = new Set<string>();
    const queryTokens = this.extractMeaningfulTokens(query);

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
        score: this.scoreSource(result, queryTokens, definitionLikeQuery),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);

    return scored.slice(0, MAX_SUMMARY_CONTEXT_RESULTS).map((item) => item.result);
  }

  private filterByQueryIntent(results: SummarySource[], definitionLikeQuery: boolean): SummarySource[] {
    if (!definitionLikeQuery) {
      return results;
    }

    const informational = results.filter(
      (result) => !this.isEntertainmentDomain(result.url) && !this.isDictionaryDomain(result.url),
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

  private scoreSource(result: SummarySource, queryTokens: string[], definitionLikeQuery: boolean): number {
    let score = 0;
    score += this.queryOverlapScore(result, queryTokens) * 8;
    score += this.authorityScore(result.url);

    if (definitionLikeQuery && this.isEntertainmentDomain(result.url)) {
      score -= 2.5;
    }

    if (result.description.trim().length < 50) {
      score -= 0.5;
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

  private buildFallbackSummary(results: SummarySource[]): string | null {
    const sources = results.slice(0, 2);
    if (sources.length === 0) {
      return null;
    }

    const sentences = sources
      .map((source, index) => {
        const cleaned = source.description.replace(/\s+/g, ' ').trim();
        if (!cleaned) {
          return null;
        }

        const clipped = cleaned.length > 180 ? `${cleaned.slice(0, 177).trimEnd()}...` : cleaned;
        return clipped;
      })
      .filter((value): value is string => Boolean(value));

    if (sentences.length === 0) {
      return null;
    }

    return sentences.join(' ');
  }

  private toNaturalSummary(summary: string | null, maxSentences: number): string | null {
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

    const sentences = normalized.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [normalized];
    return sentences
      .slice(0, maxSentences)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0)
      .join(' ');
  }
}
