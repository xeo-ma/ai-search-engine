import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';

import { TtsService } from '../modules/tts/tts.service.js';

const querySchema = z.object({
  text: z.string().trim().min(1).max(120),
});

export const ttsRoute: FastifyPluginAsync = async (app) => {
  const service = new TtsService();

  app.get('/tts', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Invalid text query parameter' });
    }

    if (!service.isConfigured()) {
      return reply.status(503).send({ message: 'TTS service is not configured' });
    }

    try {
      const audio = await service.synthesize(parsed.data.text);
      if (!audio) {
        return reply.status(404).send({ message: 'Unable to synthesize audio' });
      }

      reply.header('content-type', audio.contentType);
      reply.header('cache-control', 'no-store');
      return reply.send(audio.audio);
    } catch (error) {
      request.log.error({ error }, 'TTS request failed');
      return reply.status(500).send({ message: 'TTS service unavailable' });
    }
  });
};
