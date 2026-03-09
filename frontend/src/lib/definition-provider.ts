export interface NormalizedDefinition {
  word: string;
  phonetic?: string;
  partOfSpeech?: string;
  definition: string;
  example?: string;
  audioUrl?: string;
}

export interface DefinitionProvider {
  define(word: string): Promise<NormalizedDefinition | null>;
}

interface DictionaryDefinitionItem {
  definition?: string;
  example?: string;
}

interface DictionaryMeaningItem {
  partOfSpeech?: string;
  definitions?: DictionaryDefinitionItem[];
}

interface DictionaryPhoneticItem {
  text?: string;
  audio?: string;
}

interface DictionaryEntryItem {
  word?: string;
  phonetic?: string;
  phonetics?: DictionaryPhoneticItem[];
  meanings?: DictionaryMeaningItem[];
}

const DICTIONARY_BASE_URL = process.env.DICTIONARY_API_BASE_URL ?? 'https://api.dictionaryapi.dev/api/v2/entries/en';
const ARCHAIC_HINT_PATTERN = /\b(obsolete|archaic|dated|historical|old-fashioned)\b/i;

interface DefinitionCandidate {
  partOfSpeech?: string;
  definition: string;
  example?: string;
}

function normalizeAudioUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  return trimmed;
}

function scoreCandidate(candidate: DefinitionCandidate): number {
  const words = candidate.definition.split(/\s+/).filter(Boolean).length;
  const hasExample = Boolean(candidate.example?.trim());
  const isNoun = candidate.partOfSpeech?.toLowerCase() === 'noun';
  const hasArchaicHint = ARCHAIC_HINT_PATTERN.test(candidate.definition);

  let score = 0;
  if (hasExample) {
    score += 4;
  }
  if (isNoun) {
    score += 1;
  }
  score += Math.min(words / 12, 2);
  if (hasArchaicHint) {
    score -= 3;
  }

  return score;
}

function selectBestDefinition(entry: DictionaryEntryItem): DefinitionCandidate | null {
  const meanings = entry.meanings ?? [];
  let best: DefinitionCandidate | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const meaning of meanings) {
    const firstDefinition = meaning.definitions?.find((item) => item.definition?.trim());
    const definition = firstDefinition?.definition?.trim();
    if (!definition) {
      continue;
    }

    const candidate: DefinitionCandidate = {
      partOfSpeech: meaning.partOfSpeech?.trim(),
      definition,
      example: firstDefinition?.example?.trim(),
    };
    const score = scoreCandidate(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function normalizeEntry(entry: DictionaryEntryItem): NormalizedDefinition | null {
  const word = entry.word?.trim();
  const bestDefinition = selectBestDefinition(entry);
  const definitionText = bestDefinition?.definition;

  if (!word || !definitionText) {
    return null;
  }

  const phonetic = entry.phonetic?.trim() || entry.phonetics?.find((item) => item.text?.trim())?.text?.trim();
  const audioUrl = normalizeAudioUrl(entry.phonetics?.find((item) => item.audio?.trim())?.audio);
  const example = bestDefinition?.example?.trim();
  const partOfSpeech = bestDefinition?.partOfSpeech?.trim();

  return {
    word,
    phonetic,
    partOfSpeech,
    definition: definitionText,
    example,
    audioUrl,
  };
}

export class DictionaryApiProvider implements DefinitionProvider {
  async define(word: string): Promise<NormalizedDefinition | null> {
    const trimmedWord = word.trim().toLowerCase();
    if (!trimmedWord) {
      return null;
    }

    const response = await fetch(`${DICTIONARY_BASE_URL}/${encodeURIComponent(trimmedWord)}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as DictionaryEntryItem[];
    const firstEntry = payload[0];
    if (!firstEntry) {
      return null;
    }

    return normalizeEntry(firstEntry);
  }
}
