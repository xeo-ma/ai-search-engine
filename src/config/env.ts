import dotenv from "dotenv";

dotenv.config();

const getRequired = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.HOST ?? "0.0.0.0",
  port: toNumber(process.env.PORT, 3000),
  webSearchApiKey: getRequired(process.env.WEB_SEARCH_API_KEY, "WEB_SEARCH_API_KEY"),
  webSearchApiUrl: process.env.WEB_SEARCH_API_URL ?? "https://api.example-search.test/v1/search",
  openAiApiKey: getRequired(process.env.OPENAI_API_KEY, "OPENAI_API_KEY"),
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  cacheTtlSeconds: toNumber(process.env.CACHE_TTL_SECONDS, 120),
  safeModeDefault: process.env.SAFE_MODE_DEFAULT !== "false",
};
