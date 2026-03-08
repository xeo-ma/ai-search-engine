import { OpenAiSummarizationProvider } from '../providers/llm/openai.provider.js';
import type { LlmSummarizationProvider, SummarySource } from '../providers/llm/provider.interface.js';

const MAX_SUMMARY_RESULTS = 5;
const MAX_SUMMARY_SENTENCES = 4;
const TOKEN_PATTERN = /[a-z0-9]+/g;
const CITATION_MARKER_PATTERN = /\s*\[\d+\]/g;
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is',
  'it', 'of', 'on', 'or', 'that', 'the', 'to', 'with',
]);

export interface SummarizationResult {
  summary: string | null;
  error: string | null;
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
      return { summary: null, error: null };
    }

    const candidateResults = results.slice(0, MAX_SUMMARY_RESULTS);
    if (candidateResults.length === 0) {
      return { summary: null, error: null };
    }

    if (!this.provider) {
      return {
        summary: this.buildFallbackSummary(candidateResults),
        error: null,
      };
    }

    try {
      const ambiguousQuery = this.isLikelyAmbiguous(trimmedQuery, candidateResults);
      const summary = await this.provider.summarize({
        query: trimmedQuery,
        results: candidateResults,
        ambiguousQuery,
      });

      return { summary: this.toNaturalSummary(summary), error: null };
    } catch {
      return {
        summary: this.toNaturalSummary(this.buildFallbackSummary(candidateResults)),
        error: null,
      };
    }
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

  private toNaturalSummary(summary: string | null): string | null {
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
      .slice(0, MAX_SUMMARY_SENTENCES)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0)
      .join(' ');
  }
}
