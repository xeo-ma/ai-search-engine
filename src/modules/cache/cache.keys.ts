export const cacheKeys = {
  search: (query: string, safeMode: boolean): string =>
    `search:${safeMode ? "safe" : "raw"}:${query.toLowerCase()}`,
};
