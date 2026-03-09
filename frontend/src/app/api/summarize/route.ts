import { NextResponse } from 'next/server';

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const SUMMARY_CACHE_TTL_MS = 10 * 60 * 1000;
const SUMMARY_CACHE_MAX_ENTRIES = 300;

interface CachedSummaryEntry {
  expiresAt: number;
  payload: unknown;
}

const summaryCache = new Map<string, CachedSummaryEntry>();

function buildSummaryCacheKey(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const record = body as { query?: unknown; results?: unknown };
  if (typeof record.query !== 'string' || !Array.isArray(record.results)) {
    return null;
  }

  const normalizedQuery = record.query.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  const normalizedResults = record.results
    .slice(0, 5)
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const row = item as { title?: unknown; url?: unknown; description?: unknown };
      return {
        title: typeof row.title === 'string' ? row.title.trim() : '',
        url: typeof row.url === 'string' ? row.url.trim() : '',
        description: typeof row.description === 'string' ? row.description.trim() : '',
      };
    })
    .filter((item): item is { title: string; url: string; description: string } => Boolean(item));

  if (normalizedResults.length === 0) {
    return null;
  }

  return JSON.stringify({ query: normalizedQuery, results: normalizedResults });
}

function readSummaryCache(cacheKey: string): unknown | null {
  const entry = summaryCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    summaryCache.delete(cacheKey);
    return null;
  }

  return entry.payload;
}

function isCacheableSummarizeResponse(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const record = payload as { summary?: unknown; claims?: unknown; summaryError?: unknown };
  if (typeof record.summaryError === 'string' && record.summaryError.trim()) {
    return false;
  }

  if (typeof record.summary === 'string' && record.summary.trim()) {
    return true;
  }

  return Array.isArray(record.claims) && record.claims.length > 0;
}

function writeSummaryCache(cacheKey: string, payload: unknown): void {
  summaryCache.set(cacheKey, {
    expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
    payload,
  });

  if (summaryCache.size <= SUMMARY_CACHE_MAX_ENTRIES) {
    return;
  }

  const now = Date.now();
  for (const [key, entry] of summaryCache.entries()) {
    if (entry.expiresAt <= now) {
      summaryCache.delete(key);
    }
  }

  while (summaryCache.size > SUMMARY_CACHE_MAX_ENTRIES) {
    const oldestKey = summaryCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    summaryCache.delete(oldestKey);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON request body' }, { status: 400 });
  }

  const cacheKey = buildSummaryCacheKey(body);
  if (cacheKey) {
    const cachedPayload = readSummaryCache(cacheKey);
    if (cachedPayload) {
      return NextResponse.json(cachedPayload, { status: 200 });
    }
  }

  try {
    const backendResponse = await fetch(`${BACKEND_BASE_URL}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const contentType = backendResponse.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const data = (await backendResponse.json()) as unknown;
      if (cacheKey && backendResponse.ok && isCacheableSummarizeResponse(data)) {
        writeSummaryCache(cacheKey, data);
      }
      return NextResponse.json(data, { status: backendResponse.status });
    }

    const text = await backendResponse.text();
    return NextResponse.json(
      { message: text || `Backend request failed with status ${backendResponse.status}` },
      { status: backendResponse.status },
    );
  } catch {
    return NextResponse.json(
      { message: 'Summarization backend is unavailable. Make sure it is running on port 3001.' },
      { status: 503 },
    );
  }
}
