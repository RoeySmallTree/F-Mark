import type { FastifyInstance } from "fastify";
import type { ForkSessionResponse } from "@f-mark/shared";
import { SessionForkService } from "./forkService.js";
import type { ForkSessionRouteBody } from "./types.js";

export function registerSessionForkRoute(
  app: FastifyInstance,
  forkService: SessionForkService,
): void {
  app.post<{
    Params: { id: string };
    Body: ForkSessionRouteBody;
  }>(
    "/sessions/:id/fork",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", minLength: 1 } },
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string" },
            path_id: { type: "string" },
            root: { type: "string" },
            name: { type: "string" },
            relaunch_agents: { type: "boolean" },
            agent_ids: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (req, reply): Promise<ForkSessionResponse | { error: string }> => {
      const result = await forkService.fork({
        sourceSessionId: decodeURIComponent(req.params.id),
        body: req.body ?? {},
      });
      if (result.status !== undefined) reply.code(result.status);
      return result.body;
    },
  );
}
