import { gptClient } from "../../clients/gpt.client.js";
import { type SummaryInput, type SummaryOutput } from "./summarize.types.js";

export const summarizeService = {
  async summarize(input: SummaryInput): Promise<SummaryOutput> {
    return gptClient.summarize(input);
  },
};
