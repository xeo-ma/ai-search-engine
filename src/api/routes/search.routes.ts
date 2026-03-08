import { type FastifyInstance } from "fastify";
import { searchController } from "../controllers/search.controller.js";

export const registerSearchRoutes = (app: FastifyInstance): void => {
  app.get("/health", async () => ({ ok: true }));
  app.post("/search", searchController);
};
