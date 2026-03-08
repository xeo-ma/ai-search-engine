export interface SummarySource {
  id: string;
  title: string;
  url: string;
  description: string;
}

export interface SummarizeInput {
  query: string;
  results: SummarySource[];
  ambiguousQuery?: boolean;
}

export interface LlmSummarizationProvider {
  summarize(input: SummarizeInput): Promise<string>;
}
