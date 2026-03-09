import fetch from 'node-fetch';

const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = 'gpt-5-mini';
const REQUEST_TIMEOUT_MS = 15000;
const INCLUDE_PATHS = ['web_search_call.action.sources', 'file_search_call.results'];

export type EvidenceSourceType = 'web' | 'file' | 'unknown';

export interface EvidenceSourceItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  sourceType: EvidenceSourceType;
  sourceIndex: number;
}

export interface ClaimEvidenceResponse {
  answerText: string;
  sources: EvidenceSourceItem[];
}

interface OpenAiResponsesPayload {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

export class OpenAiClaimEvidenceClient {
  constructor(private readonly apiKey: string) {}

  async generate(query: string, definitionStyleQuery: boolean): Promise<ClaimEvidenceResponse> {
    const input = this.buildInput(query, definitionStyleQuery);

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
          tools: [{ type: 'web_search_preview' }],
          include: INCLUDE_PATHS,
          input,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI Responses API failed: ${response.status} ${response.statusText} - ${body}`);
      }

      const payload = (await response.json()) as OpenAiResponsesPayload & Record<string, unknown>;
      const answerText = this.extractText(payload);
      const sources = this.extractSources(payload);

      return { answerText, sources };
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildInput(query: string, definitionStyleQuery: boolean): string {
    const instructions = definitionStyleQuery
      ? [
          'Return 2 to 3 concise claim statements about the dominant real-world meaning.',
          'Do not restate a dictionary definition.',
          'Prefer context, significance, implications, or practical usage.',
          'Avoid stitching unrelated interpretations.',
          'Output plain text only. One claim per line. No numbering.',
        ]
      : [
          'Return 2 to 4 concise factual claim statements grounded in sources.',
          'Prioritize the dominant interpretation and avoid unrelated tangents.',
          'Output plain text only. One claim per line. No numbering.',
        ];

    return [
      'You are producing a claim-and-evidence summary for a search product.',
      ...instructions,
      `Query: ${query}`,
    ].join('\n');
  }

  private extractText(payload: OpenAiResponsesPayload): string {
    if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
      return payload.output_text.trim();
    }

    const fragments: string[] = [];
    for (const item of payload.output ?? []) {
      for (const content of item.content ?? []) {
        if (typeof content.text === 'string' && content.text.trim()) {
          fragments.push(content.text.trim());
        }
      }
    }

    return fragments.join('\n').trim();
  }

  private extractSources(payload: Record<string, unknown>): EvidenceSourceItem[] {
    const collected: EvidenceSourceItem[] = [];
    const nodes: unknown[] = [payload];

    while (nodes.length > 0) {
      const current = nodes.pop();
      if (!current || typeof current !== 'object') {
        continue;
      }

      const record = current as Record<string, unknown>;
      const source = this.tryNormalizeSource(record, collected.length);
      if (source) {
        collected.push(source);
      }

      for (const value of Object.values(record)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            nodes.push(item);
          }
        } else if (value && typeof value === 'object') {
          nodes.push(value);
        }
      }
    }

    const deduped = new Map<string, EvidenceSourceItem>();
    for (const source of collected) {
      const key = `${source.title}|${source.url}|${source.snippet}`;
      if (!deduped.has(key)) {
        deduped.set(key, source);
      }
    }

    return [...deduped.values()].map((source, index) => ({ ...source, sourceIndex: index }));
  }

  private tryNormalizeSource(record: Record<string, unknown>, sourceIndex: number): EvidenceSourceItem | null {
    const title = this.pickString(record, ['title', 'name', 'filename']);
    const url = this.pickString(record, ['url', 'link']) ?? '';
    const snippet = this.pickString(record, ['snippet', 'text', 'content', 'quote', 'summary']) ?? '';
    const fileId = this.pickString(record, ['file_id']);

    if (!title && !url) {
      return null;
    }

    let domain = '';
    if (url) {
      try {
        domain = new URL(url).hostname;
      } catch {
        domain = '';
      }
    }

    const sourceType: EvidenceSourceType = fileId ? 'file' : url ? 'web' : 'unknown';
    const normalizedTitle = title?.trim() || domain || 'Untitled source';

    return {
      id: `src-${sourceIndex}-${normalizedTitle.toLowerCase().replace(/\s+/g, '-')}`,
      title: normalizedTitle,
      url: url.trim(),
      domain,
      snippet: snippet.trim(),
      sourceType,
      sourceIndex,
    };
  }

  private pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
    return undefined;
  }
}
