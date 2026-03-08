import type { SummarySource } from '../providers/llm/provider.interface.js';

const MAX_SUMMARY_SOURCES = 5;

interface BuildPromptOptions {
  ambiguousQuery?: boolean;
}

export function buildSummarizationPrompt(
  query: string,
  results: SummarySource[],
  options: BuildPromptOptions = {},
): string {
  const topResults = results.slice(0, MAX_SUMMARY_SOURCES);

  const formattedSources = topResults
    .map((result, index) => {
      const sourceNumber = index + 1;
      return [
        `[${sourceNumber}] ${result.title}`,
        `URL: ${result.url}`,
        `Snippet: ${result.description}`,
      ].join('\n');
    })
    .join('\n\n');

  const modeInstructions = options.ambiguousQuery
    ? [
        'The query appears ambiguous across multiple meanings in the sources.',
        'Do not force a single definition.',
        'Write one short paragraph of 2 to 4 sentences.',
        'Summarize the main distinct meanings shown by the sources.',
        'If meanings conflict, state that clearly and keep each sentence tightly grounded.',
      ]
    : [
        'Write one short paragraph of 2 to 4 sentences.',
        'Keep sentences compact and search-native.',
        'Summarize the dominant meaning from the highest-ranked sources.',
      ];

  return [
    'You are generating a concise, neutral web-search summary.',
    ...modeInstructions,
    'Use only facts explicitly present in the source snippets below.',
    'Do not infer, generalize, or add background knowledge beyond the snippets.',
    'Keep a neutral, factual tone.',
    'Do not write as a chatbot and do not address the user directly.',
    'Do not include inline citation markers such as [1] or [2].',
    'Do not invent facts and do not include markdown headings.',
    '',
    `Query: ${query}`,
    '',
    'Sources:',
    formattedSources,
  ].join('\n');
}
