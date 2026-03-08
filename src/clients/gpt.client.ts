import { env } from "../config/env.js";
import { type SummaryInput, type SummaryOutput } from "../modules/summarize/summarize.types.js";

export const gptClient = {
  async summarize(input: SummaryInput): Promise<SummaryOutput> {
    void env.openAiApiKey;

    const sources = input.results.slice(0, 3).map((item) => item.title);

    return {
      text: `Summary for \"${input.query}\": ${sources.join("; ") || "No safe results available."}`,
      model: env.openAiModel,
    };
  },
};
