import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSummaryEvidenceSelection,
  dedupeSearchResults,
  rankSearchResults,
  normalizeSearchResults,
  selectEvidenceForSummary,
} from '../../src/modules/search/evidence-pipeline.js';
import type { SearchResultDto } from '../../src/modules/search/dto.js';

function makeResult(id: string, title: string, url: string, description: string): SearchResultDto {
  return {
    id,
    title,
    url,
    description,
    source: 'brave',
  };
}

test('dedupeSearchResults removes exact duplicate URLs and near-duplicates on same domain', () => {
  const results = normalizeSearchResults([
    makeResult('1', 'Fastify docs', 'https://fastify.dev/docs/latest/', 'Fastify documentation and APIs.'),
    makeResult('2', 'Fastify docs duplicate', 'https://fastify.dev/docs/latest/', 'Fastify documentation and APIs.'),
    makeResult(
      '3',
      'Fastify docs',
      'https://fastify.dev/docs/latest/Reference/',
      'Fastify documentation and APIs.',
    ),
    makeResult('4', 'Wikipedia Fastify', 'https://en.wikipedia.org/wiki/Fastify', 'Overview of Fastify framework.'),
  ]);

  const deduped = dedupeSearchResults('fastify', results);
  assert.equal(deduped.removedExactDuplicates, 1);
  assert.equal(deduped.removedNearDuplicates, 1);
  assert.equal(deduped.deduped.length, 2);
});

test('rankSearchResults boosts exact query matches in title/snippet', () => {
  const prepared = dedupeSearchResults(
    'physics',
    normalizeSearchResults([
      makeResult('1', 'Physics - Wikipedia', 'https://en.wikipedia.org/wiki/Physics', 'Physics is the scientific study of matter and energy.'),
      makeResult('2', 'General science article', 'https://example.com/science', 'An article about science topics and study methods.'),
    ]),
  ).deduped;

  const ranked = rankSearchResults('physics', prepared).sort((a, b) => b.score - a.score);
  assert.equal(ranked[0]?.result.url, 'https://en.wikipedia.org/wiki/Physics');
  assert.ok((ranked[0]?.breakdown.exactTitleMatch ?? 0) > 0);
});

test('selectEvidenceForSummary prefers domain diversity when scores are close', () => {
  const selection = buildSummaryEvidenceSelection('ai', [
    makeResult('1', 'OpenAI', 'https://openai.com', 'OpenAI develops AI systems.'),
    makeResult('2', 'OpenAI Research', 'https://openai.com/research', 'Research updates about AI systems.'),
    makeResult('3', 'Wikipedia AI', 'https://en.wikipedia.org/wiki/Artificial_intelligence', 'Artificial intelligence overview and history.'),
    makeResult('4', 'Britannica AI', 'https://www.britannica.com/technology/artificial-intelligence', 'Definition and overview of AI.'),
  ]);

  const domains = selectEvidenceForSummary(
    rankSearchResults(
      'ai',
      dedupeSearchResults('ai', normalizeSearchResults(selection.selectedEvidence)).deduped,
    ),
  ).map((item) => new URL(item.url).hostname);

  assert.ok(domains.includes('openai.com'));
  assert.ok(domains.some((domain) => domain.includes('wikipedia.org')));
  assert.ok(domains.some((domain) => domain.includes('britannica.com')));
});

test('broad acronym queries prefer neutral reference evidence over product pages', () => {
  const selection = buildSummaryEvidenceSelection('ai', [
    makeResult(
      '1',
      'Google AI - How we are making AI helpful for everyone',
      'https://ai.google',
      'Discover how Google AI is committed to enriching knowledge and helping people grow.',
    ),
    makeResult(
      '2',
      'Perplexity AI',
      'https://www.perplexity.ai',
      'Perplexity is an answer engine that helps users find information quickly.',
    ),
    makeResult(
      '3',
      'What is Artificial Intelligence (AI)? | Google Cloud',
      'https://cloud.google.com/learn/what-is-artificial-intelligence',
      'Artificial intelligence overview from Google Cloud.',
    ),
    makeResult(
      '4',
      'Artificial intelligence - Wikipedia',
      'https://en.wikipedia.org/wiki/Artificial_intelligence',
      'Artificial intelligence is intelligence demonstrated by machines.',
    ),
    makeResult(
      '5',
      'Artificial intelligence | Britannica',
      'https://www.britannica.com/technology/artificial-intelligence',
      'Artificial intelligence covers methods that allow machines to perform tasks associated with human intelligence.',
    ),
  ]);

  assert.ok(selection.selectedEvidence.length > 0);
  const firstDomain = new URL(selection.selectedEvidence[0].url).hostname;
  assert.ok(firstDomain.includes('wikipedia.org') || firstDomain.includes('britannica.com'));
  assert.ok(
    selection.selectedEvidence.some((item) => {
      const domain = new URL(item.url).hostname;
      return domain.includes('wikipedia.org') || domain.includes('britannica.com');
    }),
  );
});
