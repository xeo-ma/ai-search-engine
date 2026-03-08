import fetch, { type Response } from 'node-fetch';

import {
  type NormalizedSearchResult,
  type SafeSearchLevel,
  type WebSearchProvider,
  type WebSearchRequest,
  type WebSearchResponse,
} from './provider.interface.js';

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const DEFAULT_COUNT = 10;
const MAX_COUNT = 20;
const REQUEST_TIMEOUT_MS = 8000;

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  language?: string;
  family_friendly?: boolean;
  page_age?: string;
}

interface BraveApiResponse {
  web?: {
    results?: BraveWebResult[];
  };
  query?: {
    original?: string;
  };
}

export interface BraveSearchProviderOptions {
  apiKey: string;
}

export class BraveSearchProvider implements WebSearchProvider {
  private readonly apiKey: string;

  constructor(options: BraveSearchProviderOptions) {
    if (!options.apiKey || !options.apiKey.trim()) {
      throw new Error('BraveSearchProvider requires a non-empty API key');
    }

    this.apiKey = options.apiKey;
  }

  async search(request: WebSearchRequest): Promise<WebSearchResponse> {
    const query = request.query.trim();
    if (!query) {
      return { query: '', results: [] };
    }

    const count =
      typeof request.count === 'number' && !Number.isNaN(request.count)
        ? Math.max(1, Math.min(MAX_COUNT, Math.trunc(request.count)))
        : DEFAULT_COUNT;

    const safeSearch: SafeSearchLevel =
      request.safeSearch === 'off' || request.safeSearch === 'strict'
        ? request.safeSearch
        : 'moderate';

    const params = new URLSearchParams();
    params.set('q', query);
    params.set('count', String(count));
    params.set('safesearch', safeSearch);

    if (typeof request.offset === 'number' && request.offset >= 0) {
      params.set('offset', String(request.offset));
    }

    if (request.country) {
      params.set('country', request.country.toUpperCase());
    }

    if (request.searchLang) {
      params.set('search_lang', request.searchLang.toLowerCase());
    }

    const response = await this.fetchWithTimeout(`${BRAVE_ENDPOINT}?${params.toString()}`);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Brave search failed: ${response.status} ${response.statusText} - ${body}`);
    }

    const payload = (await response.json()) as BraveApiResponse;
    const rawResults = payload.web?.results ?? [];
    const results: NormalizedSearchResult[] = [];

    for (let i = 0; i < rawResults.length; i += 1) {
      const item = rawResults[i];
      if (!item) {
        continue;
      }

      const title = item.title?.trim();
      const url = item.url?.trim();
      const description = item.description?.trim();

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

    return {
      query: payload.query?.original ?? query,
      results,
    };
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': this.apiKey,
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Brave search timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
