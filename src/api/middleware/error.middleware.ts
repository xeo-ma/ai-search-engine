import { type FastifyInstance } from "fastify";
import { AppError } from "../../shared/errors/app-error.js";

export const errorMiddleware = (app: FastifyInstance): void => {
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error instanceof AppError) {
      void reply.status(error.statusCode).send({ error: error.message });
      return;
    }

    void reply.status(500).send({ error: "Internal Server Error" });
  });
};
