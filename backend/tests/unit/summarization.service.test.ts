import assert from 'node:assert/strict';
import test from 'node:test';

import { SummarizationService } from '../../src/modules/summarization/summarization.service.js';
import type {
  LlmSummarizationProvider,
  SummarizeInput,
  SummarySource,
} from '../../src/modules/providers/llm/provider.interface.js';

class StubProvider implements LlmSummarizationProvider {
  public lastInput: SummarizeInput | null = null;

  constructor(private readonly summaryText: string) {}

  async summarize(input: SummarizeInput): Promise<string> {
    this.lastInput = input;
    return this.summaryText;
  }
}

function makeSource(id: string, title: string, url: string, description: string): SummarySource {
  return { id, title, url, description };
}

test('definition-style query filters commercial sources and prefers lexical sources', async () => {
  const provider = new StubProvider('Context sentence one. Context sentence two.');
  const service = new SummarizationService({ provider });

  const results = [
    makeSource(
      '1',
      'DERIVE Definition & Meaning - Merriam-Webster',
      'https://www.merriam-webster.com/dictionary/derive',
      'Definition and usage notes for derive.',
    ),
    makeSource(
      '2',
      'Derive Brewing Company | Columbus Taproom and Kitchen',
      'https://derivebrewco.com/',
      'Award-winning brewery with taproom and kitchen.',
    ),
    makeSource(
      '3',
      'Online broker for trading anytime, anywhere | Deriv',
      'https://deriv.com/',
      'Online trading platform and broker services.',
    ),
    makeSource(
      '4',
      'Etymology of derive',
      'https://www.etymonline.com/word/derive',
      'Word origin, etymology, and usage history of derive.',
    ),
  ];

  const out = await service.summarize('derive', results);

  assert.equal(out.error, null);
  assert.ok(out.summary);
  assert.ok(out.sources.every((source) => !source.url.includes('derivebrewco.com')));
  assert.ok(out.sources.every((source) => !source.url.includes('deriv.com')));
  assert.ok(out.sources.some((source) => source.url.includes('merriam-webster.com')));
  assert.ok(provider.lastInput?.definitionStyleQuery);
});

test('summary source list is capped at top 3', async () => {
  const provider = new StubProvider('Sentence one. Sentence two.');
  const service = new SummarizationService({ provider });

  const results = [
    makeSource('1', 'A', 'https://example.com/a', 'A clear result about distributed systems.'),
    makeSource('2', 'B', 'https://example.com/b', 'B clear result about distributed systems.'),
    makeSource('3', 'C', 'https://example.com/c', 'C clear result about distributed systems.'),
    makeSource('4', 'D', 'https://example.com/d', 'D clear result about distributed systems.'),
    makeSource('5', 'E', 'https://example.com/e', 'E clear result about distributed systems.'),
  ];

  const out = await service.summarize('distributed systems architecture', results);
  assert.equal(out.sources.length, 3);
});

test('definition-style summaries are normalized to at most 3 sentences', async () => {
  const provider = new StubProvider('One. Two. Three. Four.');
  const service = new SummarizationService({ provider });

  const results = [
    makeSource('1', 'Moon - Britannica', 'https://www.britannica.com/science/Moon', 'Context about tides and orbit.'),
    makeSource('2', 'Moon - NASA', 'https://www.nasa.gov/moon', 'Context about lunar history and geology.'),
  ];

  const out = await service.summarize('moon', results);
  assert.equal(out.summary, 'One. Two. Three.');
});

