import fetch from 'node-fetch';

import { buildSummarizationPrompt } from '../../summarization/prompt-builder.js';
import type { LlmSummarizationProvider, SummarizeInput } from './provider.interface.js';

const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = 'gpt-5-mini';
const REQUEST_TIMEOUT_MS = 25000;

interface OpenAiResponsePayload {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

export interface OpenAiProviderOptions {
  apiKey: string;
}

export class OpenAiSummarizationProvider implements LlmSummarizationProvider {
  private readonly apiKey: string;

  constructor(options: OpenAiProviderOptions) {
    if (!options.apiKey || !options.apiKey.trim()) {
      throw new Error('OpenAiSummarizationProvider requires a non-empty API key');
    }

    this.apiKey = options.apiKey;
  }

  async summarize(input: SummarizeInput): Promise<string> {
    const prompt = buildSummarizationPrompt(
      input.query,
      input.results,
      {
        ...(typeof input.ambiguousQuery === 'boolean' ? { ambiguousQuery: input.ambiguousQuery } : {}),
        ...(typeof input.definitionStyleQuery === 'boolean'
          ? { definitionStyleQuery: input.definitionStyleQuery }
          : {}),
      },
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          input: prompt,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI Responses API failed: ${response.status} ${response.statusText} - ${body}`);
      }

      const payload = (await response.json()) as OpenAiResponsePayload;
      const summary = this.extractText(payload).trim();

      if (!summary) {
        throw new Error('OpenAI Responses API returned empty summary text');
      }

      return summary;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenAI Responses API timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractText(payload: OpenAiResponsePayload): string {
    if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
      return payload.output_text;
    }

    const fragments: string[] = [];

    for (const item of payload.output ?? []) {
      for (const content of item.content ?? []) {
        if (typeof content.text === 'string' && content.text.trim()) {
          fragments.push(content.text);
        }
      }
    }

    return fragments.join('\n').trim();
  }
}
