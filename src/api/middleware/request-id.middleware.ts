import { type FastifyInstance } from "fastify";

export const requestIdMiddleware = (app: FastifyInstance): void => {
  app.addHook("onRequest", async (request, reply) => {
    const requestId = request.headers["x-request-id"];

    if (typeof requestId === "string") {
      reply.header("x-request-id", requestId);
      return;
    }

    reply.header("x-request-id", request.id);
  });
};
