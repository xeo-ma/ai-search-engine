const OPENAI_TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_OPENAI_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_OPENAI_TTS_VOICE = 'alloy';
const DEFAULT_OPENAI_TTS_RESPONSE_FORMAT = 'wav';
const MAX_TEXT_LENGTH = 120;

export interface TtsAudioPayload {
  audio: Buffer;
  contentType: string;
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
    return { audio: Buffer.from(payload), contentType };
  }
}
