import fetch from 'node-fetch';

import {
  type SearchRequestDto,
  type SearchResultDto,
  type SearchResponseDto,
  searchRequestSchema,
} from './dto.js';
import { buildRankingAudit, buildSummaryEvidenceSelection, rerankSearchResults } from './evidence-pipeline.js';
import { buildSearchCapabilities } from './plan-features.js';
import { normalizeSnippet } from './snippet-normalizer.js';

export interface SearchServiceOptions {
  braveApiKey?: string;
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  language?: string;
  page_age?: string;
}

interface BraveSearchResponse {
  query?: { original?: string };
  web?: { results?: BraveWebResult[]; more_results_available?: boolean };
}

const BRAVE_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const DEFAULT_COUNT = 10;
const MAX_COUNT = 20;

export class SearchService {
  private readonly braveApiKey: string;

  constructor(options: SearchServiceOptions = {}) {
    const apiKey = options.braveApiKey ?? process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
      throw new Error('Missing BRAVE_SEARCH_API_KEY for Brave search integration');
    }

    this.braveApiKey = apiKey;
  }

  async search(input: SearchRequestDto): Promise<SearchResponseDto> {
    const request = searchRequestSchema.parse(input);
    const query = request.query.trim();
    const count =
      typeof request.count === 'number'
        ? Math.max(1, Math.min(MAX_COUNT, Math.trunc(request.count)))
        : DEFAULT_COUNT;

    const params = new URLSearchParams();
    params.set('q', query);
    params.set('count', String(count));
    params.set('safesearch', request.safeMode ? 'strict' : 'off');

    if (typeof request.offset === 'number' && request.offset >= 0) {
      params.set('offset', String(request.offset));
    }
    if (request.country) {
      params.set('country', request.country.toUpperCase());
    }
    if (request.searchLang) {
      params.set('search_lang', request.searchLang.toLowerCase());
    }

    const response = await fetch(`${BRAVE_SEARCH_ENDPOINT}?${params.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': this.braveApiKey,
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Brave search failed: ${response.status} ${response.statusText} - ${body}`);
    }

    const payload = (await response.json()) as BraveSearchResponse;
    const rawResults = payload.web?.results ?? [];
    const results: SearchResultDto[] = [];

    for (let i = 0; i < rawResults.length; i += 1) {
      const item = rawResults[i];
      if (!item) {
        continue;
      }

      const title = item.title?.trim();
      const url = item.url?.trim();
      const description = item.description ? normalizeSnippet(item.description) : '';
      if (!title || !url || !description) {
        continue;
      }

      let displayUrl: string | undefined;
      try {
        displayUrl = new URL(url).hostname;
      } catch {
        displayUrl = undefined;
      }

      results.push({
        id: `brave-${i}-${url}`,
        title,
        url,
        displayUrl,
        description,
        source: 'brave',
        language: item.language,
        publishedAt: item.page_age,
        age: item.age,
      });
    }

    const rerankedResults = rerankSearchResults(query, results, { safeMode: request.safeMode });
    const sources = rerankedResults.slice(0, 3).map((result) => ({
      title: result.title,
      url: result.url,
    }));
    const evidenceSelection = buildSummaryEvidenceSelection(query, rerankedResults, {
      safeMode: request.safeMode,
    });
    const rankingAudit = buildRankingAudit(query, results, { safeMode: request.safeMode });
    const capabilities = buildSearchCapabilities(request.plan, request.deepSearch);

    return {
      query: payload.query?.original ?? query,
      safeModeApplied: request.safeMode,
      summary: null,
      summaryError: null,
      sources,
      results: rerankedResults,
      retrievedCount: evidenceSelection.retrievedCount,
      selectedCount: evidenceSelection.selectedCount,
      selectedEvidence: evidenceSelection.selectedEvidence,
      rankingAudit,
      capabilities,
      moreResultsAvailable: payload.web?.more_results_available,
    };
  }
}
