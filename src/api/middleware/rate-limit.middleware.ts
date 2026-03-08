import { type FastifyInstance } from "fastify";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

const bucket = new Map<string, { count: number; windowStart: number }>();

export const rateLimitMiddleware = (app: FastifyInstance): void => {
  app.addHook("onRequest", async (request, reply) => {
    const now = Date.now();
    const key = request.ip;
    const existing = bucket.get(key);

    if (!existing || now - existing.windowStart > WINDOW_MS) {
      bucket.set(key, { count: 1, windowStart: now });
      return;
    }

    existing.count += 1;

    if (existing.count > MAX_REQUESTS_PER_WINDOW) {
      await reply.status(429).send({ error: "Too Many Requests" });
    }
  });
};
