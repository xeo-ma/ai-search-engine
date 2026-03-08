import { type FastifyReply, type FastifyRequest } from "fastify";
import { parseSearchRequest } from "../schemas/search.schema.js";
import { queryPipelineService } from "../../modules/orchestration/query-pipeline.service.js";

export const searchController = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const input = parseSearchRequest(request.body);
  const result = await queryPipelineService.execute(input);
  await reply.code(200).send(result);
};
