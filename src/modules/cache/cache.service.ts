import { cacheClient } from "../../clients/cache.client.js";
import { env } from "../../config/env.js";

export const cacheService = {
  async get<T>(key: string): Promise<T | null> {
    return cacheClient.get<T>(key);
  },

  async set<T>(key: string, value: T): Promise<void> {
    await cacheClient.set<T>(key, value, env.cacheTtlSeconds);
  },
};
