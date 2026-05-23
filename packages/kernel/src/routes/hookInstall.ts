import type { FastifyInstance } from "fastify";
import { checkHookInstallStatus, renderInstallInstructions } from "../hooksInstall/index.js";

export function registerHookInstallRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { runtime_id?: string; participant_id?: string; user_participant_id?: string } }>(
    "/managed-agents/hook-install-status",
    async (req, reply) => {
      const { runtime_id, participant_id, user_participant_id } = req.query;
      if (!runtime_id || !participant_id) {
        reply.code(400);
        return { error: "runtime_id and participant_id required" };
      }
      try {
        return await checkHookInstallStatus({
          runtimeId: runtime_id,
          participantId: participant_id,
          userParticipantId: user_participant_id,
        });
      } catch (e: any) {
        reply.code(400);
        return { error: e.message };
      }
    },
  );
  app.post<{ Querystring: { runtime_id?: string; participant_id?: string; user_participant_id?: string } }>(
    "/managed-agents/hook-install-instructions",
    async (req, reply) => {
      const { runtime_id, participant_id, user_participant_id } = req.query;
      if (!runtime_id || !participant_id || !user_participant_id) {
        reply.code(400);
        return { error: "all params required" };
      }
      try {
        return renderInstallInstructions({
          runtimeId: runtime_id,
          participantId: participant_id,
          userParticipantId: user_participant_id,
        });
      } catch (e: any) {
        reply.code(400);
        return { error: e.message };
      }
    },
  );
}
