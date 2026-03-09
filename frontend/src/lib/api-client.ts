export interface SearchItem {
  id: string;
  title: string;
  url: string;
  description: string;
  displayUrl?: string;
}

export interface SearchResponse {
  query: string;
  safeModeApplied: boolean;
  summary: string | null;
  summaryError?: string | null;
  sources: Array<{ title: string; url: string }>;
  results: SearchItem[];
  moreResultsAvailable?: boolean;
}

export interface SearchRequest {
  query: string;
  safeMode?: boolean;
  count?: number;
  offset?: number;
}

export interface SummarizeRequest {
  query: string;
  results: SearchItem[];
}

export interface SummarizeResponse {
  summary: string | null;
  summaryError?: string | null;
  sources?: Array<{ title: string; url: string }>;
}

export interface DefinitionResponse {
  word: string;
  phonetic?: string;
  partOfSpeech?: string;
  definition: string;
  example?: string;
  audioUrl?: string;
}

const SEARCH_ENDPOINT = '/api/search';
const SUMMARIZE_ENDPOINT = '/api/summarize';
const DEFINE_ENDPOINT = '/api/define';
const SEARCH_TIMEOUT_MS = 15000;
const SUMMARIZE_TIMEOUT_MS = 25000;
const DEFINE_TIMEOUT_MS = 12000;
const NETWORK_RETRY_DELAY_MS = 300;
const SUMMARY_UNAVAILABLE_MESSAGE = 'AI summary unavailable right now.';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchApi(payload: SearchRequest): Promise<SearchResponse> {
  let response: Response | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

    try {
      response = await fetch(SEARCH_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      break;
    } catch (error) {
      const isLastAttempt = attempt === 1;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Search is taking longer than expected. Please try again.');
      }

      if (!isLastAttempt) {
        await sleep(NETWORK_RETRY_DELAY_MS);
        continue;
      }

      throw new Error('Search is temporarily unavailable. Check your connection and try again.');
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!response) {
    throw new Error('Search is temporarily unavailable. Please try again.');
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const data = (await response.json()) as { message?: string };
      throw new Error(data.message ?? `Search request failed with status ${response.status}`);
    }

    const body = await response.text();
    throw new Error(body || `Search request failed with status ${response.status}`);
  }

  return (await response.json()) as SearchResponse;
}

export async function summarizeApi(payload: SummarizeRequest): Promise<SummarizeResponse> {
  const requestBody = JSON.stringify({
    query: payload.query,
    results: payload.results.slice(0, 5).map((result) => ({
      id: result.id,
      title: result.title,
      url: result.url,
      description: result.description,
    })),
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUMMARIZE_TIMEOUT_MS);

    try {
      const response = await fetch(SUMMARIZE_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: requestBody,
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status >= 500 && attempt === 0) {
          await sleep(NETWORK_RETRY_DELAY_MS);
          continue;
        }

        return { summary: null, summaryError: SUMMARY_UNAVAILABLE_MESSAGE };
      }

      return (await response.json()) as SummarizeResponse;
    } catch (error) {
      if (attempt === 0) {
        await sleep(NETWORK_RETRY_DELAY_MS);
        continue;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        return { summary: null, summaryError: SUMMARY_UNAVAILABLE_MESSAGE };
      }

      return { summary: null, summaryError: SUMMARY_UNAVAILABLE_MESSAGE };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { summary: null, summaryError: SUMMARY_UNAVAILABLE_MESSAGE };
}

export async function defineApi(word: string): Promise<DefinitionResponse | null> {
  const trimmedWord = word.trim();
  if (!trimmedWord) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFINE_TIMEOUT_MS);

  try {
    const response = await fetch(`${DEFINE_ENDPOINT}?word=${encodeURIComponent(trimmedWord)}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as DefinitionResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
