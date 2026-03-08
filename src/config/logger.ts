import { env } from "./env.js";

export const loggerOptions = {
  level: env.nodeEnv === "production" ? "info" : "debug",
};
