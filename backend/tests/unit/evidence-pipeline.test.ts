import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRankingAudit,
  buildSummaryEvidenceSelection,
  dedupeSearchResults,
  rankSearchResults,
  normalizeSearchResults,
  rerankSearchResults,
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

test('rerankSearchResults demotes social and low-trust domains below stronger references', () => {
  const reranked = rerankSearchResults('artificial intelligence', [
    makeResult(
      '1',
      'Artificial intelligence - Wikipedia',
      'https://en.wikipedia.org/wiki/Artificial_intelligence',
      'Artificial intelligence is intelligence demonstrated by machines.',
    ),
    makeResult(
      '2',
      'AI explainer thread',
      'https://x.com/example/status/123',
      'A thread about artificial intelligence and machine learning basics.',
    ),
    makeResult(
      '3',
      'What is artificial intelligence? | Britannica',
      'https://www.britannica.com/technology/artificial-intelligence',
      'Overview of artificial intelligence and its applications.',
    ),
  ]);

  assert.equal(new URL(reranked[0]?.url ?? '').hostname, 'en.wikipedia.org');
  assert.equal(new URL(reranked[1]?.url ?? '').hostname, 'www.britannica.com');
  assert.equal(new URL(reranked[2]?.url ?? '').hostname, 'x.com');
});

test('rankSearchResults demotes spammy year-heavy listicles below stronger technical results', () => {
  const prepared = dedupeSearchResults(
    'ai use cases',
    normalizeSearchResults([
      makeResult(
        '1',
        'Top 10 AI use cases in 2026 to boost efficiency',
        'https://example.com/top-ai-use-cases',
        'Top 10 AI use cases in 2026 to boost efficiency across every team.',
      ),
      makeResult(
        '2',
        'AI use cases by industry | Deloitte',
        'https://www.deloitte.com/us/en/services/consulting/articles/ai-use-cases.html',
        'AI use cases organized by industry, function, and business value.',
      ),
    ]),
  ).deduped;

  const ranked = rankSearchResults('ai use cases', prepared).sort((a, b) => b.score - a.score);
  assert.equal(new URL(ranked[0]?.result.url ?? '').hostname, 'www.deloitte.com');
  assert.ok((ranked[1]?.breakdown.spammyResultDemotion ?? 0) > 0);
});

test('safeMode-sensitive ranking demotes explicit result text when safe search is on', () => {
  const prepared = dedupeSearchResults(
    'violence overview',
    normalizeSearchResults([
      makeResult(
        '1',
        'Violence - Wikipedia',
        'https://en.wikipedia.org/wiki/Violence',
        'Violence is the use of physical force in a research and historical context.',
      ),
      makeResult(
        '2',
        'Graphic violence videos',
        'https://example.com/graphic-violence',
        'Graphic violence and gore clips collected in one place.',
      ),
    ]),
  ).deduped;

  const ranked = rankSearchResults('violence overview', prepared, { safeMode: true }).sort((a, b) => b.score - a.score);
  assert.equal(new URL(ranked[0]?.result.url ?? '').hostname, 'en.wikipedia.org');
  assert.ok((ranked[1]?.breakdown.safeModeSensitiveDemotion ?? 0) > 0);
});

test('safeMode-sensitive ranking is lighter for educational or news context', () => {
  const prepared = dedupeSearchResults(
    'graphic violence reporting',
    normalizeSearchResults([
      makeResult(
        '1',
        'News report on graphic violence',
        'https://news.example.com/report',
        'News reporting and historical context for graphic violence in conflict zones.',
      ),
      makeResult(
        '2',
        'Graphic violence clips',
        'https://example.com/clips',
        'Graphic violence and gore clips with explicit scenes.',
      ),
    ]),
  ).deduped;

  const ranked = rankSearchResults('graphic violence reporting', prepared, { safeMode: true }).sort((a, b) => b.score - a.score);
  const reporting = ranked.find((item) => item.result.url === 'https://news.example.com/report');
  const explicit = ranked.find((item) => item.result.url === 'https://example.com/clips');

  assert.ok((reporting?.breakdown.safeModeSensitiveDemotion ?? 0) > 0);
  assert.ok((reporting?.breakdown.safeModeSensitiveDemotion ?? 0) < (explicit?.breakdown.safeModeSensitiveDemotion ?? 0));
});

test('buildRankingAudit returns compact demotion counts without raw scores', () => {
  const audit = buildRankingAudit(
    'ai use cases',
    normalizeSearchResults([
      makeResult(
        '1',
        'Top 10 AI use cases in 2026 to boost efficiency',
        'https://example.com/top-ai-use-cases',
        'Top 10 AI use cases in 2026 to boost efficiency across every team.',
      ),
      makeResult(
        '2',
        'AI overview thread',
        'https://x.com/example/status/123',
        'A thread about artificial intelligence use cases.',
      ),
      makeResult(
        '3',
        'AI use cases | Britannica',
        'https://www.britannica.com/technology/artificial-intelligence',
        'Overview of artificial intelligence and its applications.',
      ),
    ]),
    { safeMode: true },
  );

  assert.equal(audit.safeSearchLevel, 'strict');
  assert.equal(audit.reranked, true);
  assert.ok(audit.lowTrustDemotions >= 1);
  assert.ok(audit.spammyDemotions >= 1);
  assert.ok(audit.topDemotionReasons.length > 0);
});
