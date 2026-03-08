import Fastify, { type FastifyInstance } from 'fastify';

import { searchRoute } from './routes/search.route.js';

export function createApp(): FastifyInstance {
  const app = Fastify({ logger: true });
  const allowedOrigin = 'http://localhost:3000';

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;

    if (origin === allowedOrigin) {
      reply.header('Access-Control-Allow-Origin', allowedOrigin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
  });

  app.options('/*', async (request, reply) => {
    if (request.headers.origin === allowedOrigin) {
      return reply.status(204).send();
    }

    return reply.status(403).send({ message: 'CORS origin not allowed' });
  });

  app.get('/health', async () => ({ ok: true }));
  app.register(searchRoute);

  return app;
}
