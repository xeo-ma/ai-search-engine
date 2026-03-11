import assert from 'node:assert/strict';
import test from 'node:test';

import { SearchService } from '../../src/modules/search/search.service.js';

function createMockResponse(results: Array<{ title: string; url: string; description: string }>) {
  return {
    ok: true,
    json: async () => ({
      query: { original: 'ai' },
      web: {
        results,
        more_results_available: true,
      },
    }),
  } as const;
}

test('search service overfetches candidates for pro deep search but returns requested page size', async () => {
  let requestedUrl = '';

  const service = new SearchService({
    braveApiKey: 'test-key',
    fetchImpl: (async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return createMockResponse([
        { title: 'Result 1', url: 'https://example.com/1', description: 'ai result one' },
        { title: 'Result 2', url: 'https://example.com/2', description: 'ai result two' },
        { title: 'Result 3', url: 'https://example.com/3', description: 'ai result three' },
        { title: 'Result 4', url: 'https://example.com/4', description: 'ai result four' },
        { title: 'Result 5', url: 'https://example.com/5', description: 'ai result five' },
        { title: 'Result 6', url: 'https://example.com/6', description: 'ai result six' },
        { title: 'Result 7', url: 'https://example.com/7', description: 'ai result seven' },
        { title: 'Result 8', url: 'https://example.com/8', description: 'ai result eight' },
        { title: 'Result 9', url: 'https://example.com/9', description: 'ai result nine' },
        { title: 'Result 10', url: 'https://example.com/10', description: 'ai result ten' },
        { title: 'Result 11', url: 'https://example.com/11', description: 'ai result eleven' },
        { title: 'Result 12', url: 'https://example.com/12', description: 'ai result twelve' },
      ]);
    }) as typeof fetch,
  });

  const response = await service.search({
    query: 'ai',
    safeMode: true,
    plan: 'pro',
    deepSearch: true,
    count: 10,
    offset: 0,
  });

  const params = new URL(requestedUrl).searchParams;
  assert.equal(params.get('count'), '20');
  assert.equal(response.results.length, 10);
  assert.equal(response.capabilities?.deepSearchApplied, true);
  assert.equal(response.capabilities?.deepSearchAllowed, true);
});

test('search service keeps standard provider count for free plan even if deep search is requested', async () => {
  let requestedUrl = '';

  const service = new SearchService({
    braveApiKey: 'test-key',
    fetchImpl: (async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return createMockResponse([
        { title: 'Result 1', url: 'https://example.com/1', description: 'ai result one' },
      ]);
    }) as typeof fetch,
  });

  const response = await service.search({
    query: 'ai',
    safeMode: true,
    plan: 'free',
    deepSearch: true,
    count: 10,
    offset: 0,
  });

  const params = new URL(requestedUrl).searchParams;
  assert.equal(params.get('count'), '10');
  assert.equal(response.capabilities?.deepSearchApplied, false);
  assert.equal(response.capabilities?.deepSearchAllowed, false);
});
