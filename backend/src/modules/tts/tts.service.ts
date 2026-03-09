const OPENAI_TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_OPENAI_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_OPENAI_TTS_VOICE = 'alloy';
const DEFAULT_OPENAI_TTS_RESPONSE_FORMAT = 'wav';
const MAX_TEXT_LENGTH = 120;
const MAX_CACHE_ENTRIES = 200;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

export interface TtsAudioPayload {
  audio: Buffer;
  contentType: string;
}

interface CachedAudioEntry {
  payload: TtsAudioPayload;
  expiresAt: number;
}

export interface TtsServiceOptions {
  openAiApiKey?: string;
  openAiModel?: string;
  openAiVoice?: string;
  openAiResponseFormat?: string;
}

export class TtsService {
  private readonly openAiApiKey: string | null;
  private readonly openAiModel: string;
  private readonly openAiVoice: string;
  private readonly openAiResponseFormat: string;
  private readonly cache = new Map<string, CachedAudioEntry>();

  constructor(options: TtsServiceOptions = {}) {
    this.openAiApiKey = options.openAiApiKey ?? process.env.OPENAI_API_KEY ?? null;
    this.openAiModel = options.openAiModel ?? process.env.OPENAI_TTS_MODEL ?? DEFAULT_OPENAI_TTS_MODEL;
    this.openAiVoice = options.openAiVoice ?? process.env.OPENAI_TTS_VOICE ?? DEFAULT_OPENAI_TTS_VOICE;
    this.openAiResponseFormat =
      options.openAiResponseFormat ?? process.env.OPENAI_TTS_RESPONSE_FORMAT ?? DEFAULT_OPENAI_TTS_RESPONSE_FORMAT;
  }

  isConfigured(): boolean {
    return Boolean(this.openAiApiKey?.trim());
  }

  async synthesize(text: string): Promise<TtsAudioPayload | null> {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_TEXT_LENGTH || !this.openAiApiKey) {
      return null;
    }

    const cacheKey = `${this.openAiModel}|${this.openAiVoice}|${this.openAiResponseFormat}|${trimmed}`;
    const cached = this.readFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await fetch(OPENAI_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: this.openAiModel,
        voice: this.openAiVoice,
        input: trimmed,
        response_format: this.openAiResponseFormat,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') ?? 'audio/wav';
    const synthesized: TtsAudioPayload = { audio: Buffer.from(payload), contentType };
    this.writeToCache(cacheKey, synthesized);
    return synthesized;
  }

  private readFromCache(key: string): TtsAudioPayload | null {
    const item = this.cache.get(key);
    if (!item) {
      return null;
    }

    if (item.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return {
      audio: Buffer.from(item.payload.audio),
      contentType: item.payload.contentType,
    };
  }

  private writeToCache(key: string, payload: TtsAudioPayload): void {
    this.cache.set(key, {
      payload: {
        audio: Buffer.from(payload.audio),
        contentType: payload.contentType,
      },
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    while (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.cache.delete(oldestKey);
    }
  }
}
