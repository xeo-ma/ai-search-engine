import Fastify from "fastify";
import { registerSearchRoutes } from "./api/routes/search.routes.js";
import { errorMiddleware } from "./api/middleware/error.middleware.js";
import { requestIdMiddleware } from "./api/middleware/request-id.middleware.js";
import { rateLimitMiddleware } from "./api/middleware/rate-limit.middleware.js";
import { loggerOptions } from "./config/logger.js";

export const buildApp = () => {
  const app = Fastify({ logger: loggerOptions });

  requestIdMiddleware(app);
  rateLimitMiddleware(app);
  registerSearchRoutes(app);
  errorMiddleware(app);

  return app;
};
