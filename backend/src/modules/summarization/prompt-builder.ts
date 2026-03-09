import type { SummarySource } from '../providers/llm/provider.interface.js';

const MAX_SUMMARY_SOURCES = 5;

interface BuildPromptOptions {
  ambiguousQuery?: boolean;
  definitionStyleQuery?: boolean;
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

  const definitionContextInstructions = options.definitionStyleQuery
    ? [
        'A separate Definition card already covers the direct dictionary meaning.',
        'Do not restate the basic dictionary definition.',
        'Start with contextual significance or real-world role, not a dictionary-style opening sentence.',
        'Add broader context, significance, or practical importance from the sources.',
        'Write 2 to 3 sentences total.',
      ]
    : [];

  const modeInstructions = options.ambiguousQuery
    ? [
        'The query appears ambiguous across multiple meanings in the sources.',
        'Lead with the dominant/common meaning from the strongest sources.',
        'If needed, add one brief sentence that the term can also refer to other contexts.',
        'Do not stitch together unrelated entities or entertainment references.',
        ...(options.definitionStyleQuery ? [] : ['Write one short paragraph of 2 to 4 sentences.']),
      ]
    : [
        ...(options.definitionStyleQuery ? [] : ['Write one short paragraph of 2 to 4 sentences.']),
        'Keep sentences compact and search-native.',
        'Prioritize the dominant/common meaning from the highest-ranked sources.',
        'Avoid listing unrelated entities or edge-case interpretations.',
      ];

  return [
    'You are generating a concise, neutral web-search summary.',
    ...definitionContextInstructions,
    ...modeInstructions,
    'Use only facts explicitly present in the source snippets below.',
    'Do not infer, generalize, or add background knowledge beyond the snippets.',
    'Keep a neutral, factual tone.',
    'Prefer high-information, authoritative sources in tone and content.',
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
