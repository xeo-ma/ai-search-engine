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

function normalizeEntry(entry: DictionaryEntryItem): NormalizedDefinition | null {
  const word = entry.word?.trim();
  const firstMeaning = entry.meanings?.find((meaning) => (meaning.definitions?.length ?? 0) > 0);
  const firstDefinition = firstMeaning?.definitions?.find((item) => item.definition?.trim());
  const definitionText = firstDefinition?.definition?.trim();

  if (!word || !definitionText) {
    return null;
  }

  const phonetic = entry.phonetic?.trim() || entry.phonetics?.find((item) => item.text?.trim())?.text?.trim();
  const audioUrl = normalizeAudioUrl(entry.phonetics?.find((item) => item.audio?.trim())?.audio);
  const example = firstDefinition?.example?.trim();
  const partOfSpeech = firstMeaning?.partOfSpeech?.trim();

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
