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

test('definition-style summaries collapse duplicate definition sentences and normalize appositive phrasing', async () => {
  const provider = new StubProvider(
    [
      'Physics, science that deals with the structure of matter and the interactions between the fundamental constituents of the observable universe.',
      'Physics is the scientific study of matter, its fundamental constituents, its motion and behavior through space and time, and the related entities of energy and force.',
    ].join(' '),
  );
  const service = new SummarizationService({ provider });

  const results = [
    makeSource(
      '1',
      'Physics | Britannica',
      'https://www.britannica.com/science/physics-science',
      'Physics, science that deals with the structure of matter and the interactions between the fundamental constituents of the observable universe.',
    ),
    makeSource(
      '2',
      'Physics - Wikipedia',
      'https://en.wikipedia.org/wiki/Physics',
      'Physics is the scientific study of matter, its fundamental constituents, its motion and behavior through space and time, and the related entities of energy and force.',
    ),
  ];

  const out = await service.summarize('physics', results);
  assert.equal(
    out.summary,
    'physics is the science that deals with the structure of matter and the interactions between the fundamental constituents of the observable universe.',
  );
});

test('definition-style summaries rewrite dictionary meaning phrasing to usage context', async () => {
  const provider = new StubProvider('The meaning of SYNTHESIZE is to combine or produce by synthesis.');
  const service = new SummarizationService({ provider });

  const results = [
    makeSource(
      '1',
      'SYNTHESIZE Definition & Meaning - Merriam-Webster',
      'https://www.merriam-webster.com/dictionary/synthesize',
      'The meaning of SYNTHESIZE is to combine or produce by synthesis.',
    ),
    makeSource(
      '2',
      'SYNTHESIZE Definition & Meaning | Dictionary.com',
      'https://www.dictionary.com/browse/synthesize',
      'SYNTHESIZE definition: to form by combining parts or elements.',
    ),
  ];

  const out = await service.summarize('synthesize', results);
  assert.ok(out.summary);
  assert.ok(out.summary.startsWith('In common usage, synthesize means'));
  assert.ok(!out.summary.startsWith('The meaning of SYNTHESIZE is'));
});

test('evidence selection avoids repeating the exact same source across adjacent claims when alternatives exist', async () => {
  const provider = new StubProvider('Claim one sentence. Claim two sentence.');
  const service = new SummarizationService({ provider });

  const results = [
    makeSource(
      '1',
      'OpenAI',
      'https://openai.com',
      'OpenAI builds and deploys AI systems for broad use.',
    ),
    makeSource(
      '2',
      'Google Gemini',
      'https://gemini.google.com',
      'Gemini is a generative assistant from Google.',
    ),
    makeSource(
      '3',
      'Wikipedia: Artificial intelligence',
      'https://en.wikipedia.org/wiki/Artificial_intelligence',
      'Artificial intelligence is intelligence demonstrated by machines.',
    ),
  ];

  const out = await service.summarize('ai', results);
  assert.ok(out.claims.length >= 2);

  const firstClaimPrimary = out.claims[0]?.evidence[0]?.url;
  const secondClaimPrimary = out.claims[1]?.evidence[0]?.url;
  assert.ok(firstClaimPrimary);
  assert.ok(secondClaimPrimary);
  assert.notEqual(firstClaimPrimary, secondClaimPrimary);
});

test('source selection keeps at least one reference source when available for broad queries', async () => {
  const provider = new StubProvider('AI claim one. AI claim two.');
  const service = new SummarizationService({ provider });

  const results = [
    makeSource('1', 'OpenAI', 'https://openai.com', 'OpenAI develops AI systems and tools.'),
    makeSource('2', 'Google Gemini', 'https://gemini.google.com', 'Gemini is a generative AI assistant.'),
    makeSource('3', 'ChatGPT', 'https://chatgpt.com', 'ChatGPT helps users write and solve problems.'),
    makeSource(
      '4',
      'Wikipedia: Artificial intelligence',
      'https://en.wikipedia.org/wiki/Artificial_intelligence',
      'Artificial intelligence is intelligence demonstrated by machines.',
    ),
  ];

  const out = await service.summarize('ai', results);
  assert.ok(out.sources.length >= 1);
  assert.ok(out.sources.some((source) => source.url.includes('wikipedia.org')));
  assert.ok(out.sources[0]?.url.includes('wikipedia.org'));
  const productSourceCount = out.sources.filter(
    (source) =>
      source.url.includes('openai.com') ||
      source.url.includes('chatgpt.com') ||
      source.url.includes('gemini.google.com'),
  ).length;
  assert.ok(productSourceCount <= 1);
});

test('claim extraction merges punctuation-led fragments into the previous claim', async () => {
  const provider = new StubProvider(
    [
      'As one of the most fundamental scientific disciplines, physics drives research and innovation.',
      ', shedding light on how network architecture shapes neural-network learning.',
    ].join('\n'),
  );
  const service = new SummarizationService({ provider });

  const results = [
    makeSource(
      '1',
      'Physics - Wikipedia',
      'https://en.wikipedia.org/wiki/Physics',
      'Physics is the scientific study of matter, motion, and energy.',
    ),
    makeSource(
      '2',
      'Britannica: Physics',
      'https://www.britannica.com/science/physics-science',
      'Physics deals with the structure of matter and fundamental interactions.',
    ),
  ];

  const out = await service.summarize('physics', results);
  assert.equal(out.claims.length, 1);
  assert.ok(!out.claims[0].text.startsWith(','));
  assert.ok(!out.claims.some((claim) => /^,/.test(claim.text)));
});

test('fallback summary avoids truncated ellipsis fragments', async () => {
  const service = new SummarizationService();

  const results = [
    makeSource(
      '1',
      'Physics | Britannica',
      'https://www.britannica.com/science/physics-science',
      'Physics, science that deals with matter and energy. Its scope of study encompasses not only behavior under forces but also...',
    ),
    makeSource(
      '2',
      'Physics - Wikipedia',
      'https://en.wikipedia.org/wiki/Physics',
      'Physics is the scientific study of matter, motion and energy.',
    ),
  ];

  const out = await service.summarize('physics', results);
  assert.ok(out.summary);
  assert.ok(!out.summary.includes('...'));
});

test('fallback summary uses lightweight contextual phrasing for term queries', async () => {
  const service = new SummarizationService();

  const results = [
    makeSource(
      '1',
      'Time - Wikipedia',
      'https://en.wikipedia.org/wiki/Time',
      'Time is the continuous progression of existence that occurs in an apparently irreversible succession from the past, through the present, and into the future.',
    ),
    makeSource(
      '2',
      'Britannica: Time',
      'https://www.britannica.com/science/time',
      'Time is a measured or measurable period, a continuum that lacks spatial dimensions.',
    ),
  ];

  const out = await service.summarize('time', results);
  assert.ok(out.summary);
  assert.ok(out.summary.startsWith('In general usage, time is'));
  assert.match(
    out.summary,
    /(Reference sources generally describe this concept in similar terms|Across reference sources, the core meaning remains consistent|Authoritative references present a broadly consistent description)\./,
  );
  assert.ok(out.claims.every((claim) => !claim.text.toLowerCase().startsWith('reference sources')));
});

test('explanatory framework queries prioritize official docs sources over tutorial pages', async () => {
  const provider = new StubProvider('Fastify is a web framework for Node.js.');
  const service = new SummarizationService({ provider, openAiApiKey: '' });

  const results = [
    makeSource(
      '1',
      'Introduction to Fastify: A practical guide',
      'https://www.contentful.com/blog/introduction-to-fastify/',
      'The example pages generated by create-fastify show simple JSON and text responses.',
    ),
    makeSource(
      '2',
      'Fastify Documentation',
      'https://fastify.dev/docs/latest/Reference/',
      'Fast and low overhead web framework for Node.js.',
    ),
    makeSource(
      '3',
      'fastify/fastify',
      'https://github.com/fastify/fastify',
      'Fast and low overhead web framework, for Node.js.',
    ),
  ];

  const out = await service.summarize('What is fastify?', results);
  assert.ok(out.sources.length >= 1);
  assert.ok(out.sources[0]?.url.includes('fastify.dev'));
  assert.ok(out.sources.some((source) => source.url.includes('github.com/fastify')));
});

test('fallback summary ignores low-information snippet text for news-like queries', async () => {
  const service = new SummarizationService();

  const results = [
    makeSource(
      '1',
      'Hacker News',
      'https://news.ycombinator.com/',
      'We cannot provide a description for this page right now',
    ),
    makeSource(
      '2',
      'The Hacker News',
      'https://thehackernews.com/',
      'Cybersecurity coverage and security research updates.',
    ),
  ];

  const out = await service.summarize('hacker news', results);
  assert.ok(out.summary);
  assert.ok(!out.summary.toLowerCase().includes('cannot provide a description'));
  assert.ok(out.summary.includes('Top sources cover this topic from multiple angles.'));
  assert.ok(out.claims.every((claim) => !claim.text.includes('Top sources cover this topic')));
  assert.ok(out.claims.every((claim) => !claim.text.toLowerCase().includes('cannot provide a description')));
  const evidenceSnippets = out.claims.flatMap((claim) => claim.evidence.map((source) => source.snippet.toLowerCase()));
  assert.ok(evidenceSnippets.every((snippet) => !snippet.includes('cannot provide a description')));
});

test('hacker news query prefers news.ycombinator.com over marketing-heavy alternatives', async () => {
  const service = new SummarizationService();

  const results = [
    makeSource(
      '1',
      'The Hacker News | #1 Trusted Source for Cybersecurity News',
      'https://thehackernews.com/',
      'The Hacker News is the top cybersecurity news platform, delivering real-time updates and actionable insights.',
    ),
    makeSource(
      '2',
      'Hacker News',
      'https://news.ycombinator.com/',
      'Hacker News is a social news website focusing on computer science and entrepreneurship.',
    ),
    makeSource(
      '3',
      'r/BetterOffline on Reddit: Hacker News now thinks coding is solved',
      'https://www.reddit.com/r/BetterOffline/comments/example',
      'Discussion thread about Hacker News community sentiment.',
    ),
  ];

  const out = await service.summarize('hacker news', results);
  assert.ok(out.sources.length >= 1);
  assert.ok(out.sources.some((source) => source.url.includes('news.ycombinator.com')));
});
