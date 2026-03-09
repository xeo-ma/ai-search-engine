import { ZodError } from 'zod';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';

import { SearchService } from '../modules/search/search.service.js';
import type { SearchRequestDto } from '../modules/search/dto.js';
import { SummarizationService } from '../modules/summarization/summarization.service.js';

const summarizeRequestSchema = z.object({
  query: z.string().trim().min(1),
  results: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z.string().url(),
        description: z.string().trim().min(1),
      }),
    )
    .max(5),
});

export const searchRoute: FastifyPluginAsync = async (app) => {
  const service = new SearchService();
  const summarizationService = new SummarizationService();

  app.post<{ Body: SearchRequestDto }>('/search', async (request, reply) => {
    try {
      const result = await service.search(request.body);
      return reply.send(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({
          message: 'Invalid search request',
          issues: error.issues,
        });
      }

      request.log.error({ error }, 'Search request failed');
      return reply.status(500).send({ message: 'Search is temporarily unavailable. Please try again.' });
    }
  });

  app.post('/summarize', async (request, reply) => {
    try {
      const parsed = summarizeRequestSchema.parse(request.body);
      const result = await summarizationService.summarize(parsed.query, parsed.results);

      return reply.send({
        summary: result.summary,
        summaryError: result.error,
        sources: result.sources,
        claims: result.claims,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({
          message: 'Invalid summarization request',
          issues: error.issues,
        });
      }

      request.log.error({ error }, 'Summarization request failed');
      return reply.status(500).send({ message: 'Internal server error' });
    }
  });
};
