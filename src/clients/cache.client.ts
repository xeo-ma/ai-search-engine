interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

export const cacheClient = {
  async get<T>(key: string): Promise<T | null> {
    const entry = store.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }

    return entry.value as T;
  },

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  },
};
