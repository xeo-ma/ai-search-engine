import { AppError } from "../../shared/errors/app-error.js";
import { type SearchInput } from "../../modules/search/search.types.js";

export const parseSearchRequest = (body: unknown): SearchInput => {
  if (!body || typeof body !== "object") {
    throw new AppError("Invalid request body", 400);
  }

  const raw = body as Record<string, unknown>;
  const query = raw.query;
  const safeMode = raw.safeMode;

  if (typeof query !== "string" || query.trim().length < 2) {
    throw new AppError("query must be at least 2 characters", 400);
  }

  if (safeMode !== undefined && typeof safeMode !== "boolean") {
    throw new AppError("safeMode must be a boolean", 400);
  }

  if (typeof safeMode === "boolean") {
    return {
      query: query.trim(),
      safeMode,
    };
  }

  return {
    query: query.trim(),
  };
};
