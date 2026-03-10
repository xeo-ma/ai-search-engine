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

test('suppresses evidence claims when the only claim duplicates the summary', async () => {
  const provider = new StubProvider(
    [
      'Physics is the science that deals with the structure of matter and the interactions between the fundamental constituents of the observable universe.',
      'Reference sources generally describe this concept in similar terms.',
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
    'Physics is the science that deals with the structure of matter and the interactions between the fundamental constituents of the observable universe. Reference sources generally describe this concept in similar terms.',
  );
  assert.equal(out.claims.length, 0);
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

test('broad acronym queries suppress product-style chat sources when stronger references exist', async () => {
  const provider = new StubProvider(
    'Artificial intelligence is the capability of computational systems to perform tasks typically associated with human intelligence.',
  );
  const service = new SummarizationService({ provider, openAiApiKey: '' });

  const results = [
    makeSource(
      '1',
      'Artificial intelligence - Wikipedia',
      'https://en.wikipedia.org/wiki/Artificial_intelligence',
      'Artificial intelligence is the capability of computational systems to perform tasks typically associated with human intelligence.',
    ),
    makeSource(
      '2',
      'What Is Artificial Intelligence (AI)? | IBM',
      'https://www.ibm.com/think/topics/artificial-intelligence',
      'Artificial intelligence leverages computers and machines to mimic the problem-solving and decision-making capabilities of the human mind.',
    ),
    makeSource(
      '3',
      'Z.ai - Free AI Chatbot & Agent powered by GLM-5 & GLM-4.7',
      'https://chat.z.ai/',
      'Free AI chatbot and agent with advanced reasoning and multimodal capabilities.',
    ),
  ];

  const out = await service.summarize('ai', results);
  assert.ok(out.sources.some((source) => source.url.includes('wikipedia.org')));
  assert.ok(out.sources.some((source) => source.url.includes('ibm.com')));
  assert.ok(!out.sources.some((source) => source.url.includes('chat.z.ai')));
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

test('suffix explanatory queries prefer canonical references over social and blog title matches', async () => {
  const provider = new StubProvider(
    'Physics is the science that deals with matter, energy, and their interactions.',
  );
  const service = new SummarizationService({ provider, openAiApiKey: '' });

  const results = [
    makeSource(
      '1',
      'Physics - Wikipedia',
      'https://en.wikipedia.org/wiki/Physics',
      'Physics is the scientific study of matter, motion and behavior through space and time, and the related entities of energy and force.',
    ),
    makeSource(
      '2',
      'Physics | Britannica',
      'https://www.britannica.com/science/physics-science',
      'Physics is the science that deals with the structure of matter and the interactions between the fundamental constituents of the observable universe.',
    ),
    makeSource(
      '3',
      'Physics Explained (@PhysicsExplain1) / X',
      'https://x.com/PhysicsExplain1',
      'Physics Educator and creator of YouTube channel Physics Explained.',
    ),
    makeSource(
      '4',
      'Physics Explained: Video Update | Rhett Allain\'s Stuff',
      'https://rhettallain.com/2020/05/10/physics-explained-video-update/',
      'Physics Explained is going to start off as the content portion of an algebra-based physics course.',
    ),
    makeSource(
      '5',
      'Physics - spotlighting exceptional research',
      'https://physics.aps.org/',
      'Expert commentary and research highlights across physics.',
    ),
  ];

  const out = await service.summarize('Physics explained', results);
  assert.ok(out.sources.some((source) => source.url.includes('wikipedia.org')));
  assert.ok(out.sources.some((source) => source.url.includes('britannica.com')));
  assert.ok(!out.sources.some((source) => source.url.includes('x.com/PhysicsExplain1')));
  assert.ok(!out.sources.some((source) => source.url.includes('rhettallain.com')));
});

test('comparison queries preserve both sides and prefer stronger technical sources', async () => {
  const service = new SummarizationService();

  const results = [
    makeSource(
      '1',
      'OAuth 2.0 Authorization Framework',
      'https://datatracker.ietf.org/doc/html/rfc6749',
      'OAuth 2.0 is an authorization framework that enables a third-party application to obtain limited access to an HTTP service.',
    ),
    makeSource(
      '2',
      'JSON Web Token Introduction',
      'https://jwt.io/introduction',
      'JSON Web Token is an open standard used to securely transmit information between parties as a JSON object.',
    ),
    makeSource(
      '3',
      'OAuth vs JWT: Key Differences Explained | SuperTokens',
      'https://supertokens.com/blog/oauth-vs-jwt',
      'JWT: Used for secure information exchange and authentication. OAuth: Involves a multi-step process with different roles.',
    ),
    makeSource(
      '4',
      'OAuth vs JWT vs API Keys: Which Authentication Should You Use?',
      'https://dev.to/justwonder/oauth-vs-jwt-vs-api-keys-which-authentication-should-you-use-3dg1',
      'JWT is often a strong choice for scalable user authentication, while OAuth provides secure delegated access.',
    ),
    makeSource(
      '5',
      'OAuth vs JWT: Which Authentication Method Should You Use?',
      'https://aws.plainenglish.io/oauth-vs-jwt-which-authentication-method-should-you-use-123456',
      'We break down the differences between OAuth and JWT and how to decide which approach fits your use case.',
    ),
  ];

  const out = await service.summarize('OAuth vs JWT', results);
  assert.ok(out.summary);
  assert.match(out.summary, /OAuth/i);
  assert.match(out.summary, /JWT/i);
  assert.ok(!/^JWT:/i.test(out.summary));
  assert.ok(out.sources.some((source) => source.url.includes('rfc6749')));
  assert.ok(out.sources.some((source) => source.url.includes('jwt.io')));
  assert.ok(!out.sources.some((source) => source.url.includes('aws.plainenglish.io')));
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

test('suppresses summary when selected sources are low-confidence', async () => {
  const provider = new StubProvider('Acme portal lets users sign in and manage an account.');
  const service = new SummarizationService({ provider, openAiApiKey: '' });

  const results = [
    makeSource(
      '1',
      'Acme Portal Login',
      'https://portal.example.com/login',
      'Sign in to continue and access your account dashboard.',
    ),
    makeSource(
      '2',
      'Acme Account',
      'https://accounts.example.com/',
      'Log in to continue and manage your settings.',
    ),
  ];

  const out = await service.summarize('acme portal', results);
  assert.equal(out.summary, null);
  assert.equal(out.error, 'Not enough reliable sources yet to generate a trustworthy summary.');
  assert.equal(out.claims.length, 0);
});

test('keeps summary when source confidence is strong', async () => {
  const provider = new StubProvider('Physics studies matter, energy, and their interactions.');
  const service = new SummarizationService({ provider, openAiApiKey: '' });

  const results = [
    makeSource(
      '1',
      'Physics - Wikipedia',
      'https://en.wikipedia.org/wiki/Physics',
      'Physics is the scientific study of matter, energy, and their interactions.',
    ),
    makeSource(
      '2',
      'Physics | Britannica',
      'https://www.britannica.com/science/physics-science',
      'Physics is the science of matter, motion, and force.',
    ),
  ];

  const out = await service.summarize('physics', results);
  assert.ok(out.summary);
  assert.equal(out.error, null);
  assert.ok(out.sources.some((source) => source.url.includes('wikipedia.org')));
});

test('technical queries avoid marketing-heavy summary phrasing', async () => {
  const provider = new StubProvider(
    "With numbers like these, it's no surprise nearly half of architects have experimented with at least one AI tool.",
  );
  const service = new SummarizationService({ provider, openAiApiKey: '' });

  const results = [
    makeSource(
      '1',
      'AI for Architecture: 7 Transformative Use Cases',
      'https://monograph.com/ai-architecture',
      'With numbers like these, it is no surprise many architects have tried AI tools.',
    ),
    makeSource(
      '2',
      'Software architecture - Wikipedia',
      'https://en.wikipedia.org/wiki/Software_architecture',
      'Software architecture refers to fundamental structures of software systems.',
    ),
    makeSource(
      '3',
      'Architecture patterns',
      'https://www.britannica.com/technology/software-architecture',
      'Architecture patterns organize software components and interactions.',
    ),
  ];

  const out = await service.summarize('ai use cases architecture', results);
  assert.ok(out.summary);
  assert.ok(!out.summary.toLowerCase().includes("it's no surprise"));
});
