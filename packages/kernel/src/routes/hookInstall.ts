import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import { checkHookInstallStatus, renderInstallInstructions } from "../hooksInstall/index.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";

export function registerHookInstallRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
): void {
  const deps = normaliseDeps(pOrDeps);
  app.get<{ Querystring: { runtime_id?: string; participant_id?: string; user_participant_id?: string } }>(
    "/managed-agents/hook-install-status",
    async (req, reply) => {
      const { runtime_id, participant_id, user_participant_id } = req.query;
      if (!runtime_id || !participant_id) {
        reply.code(400);
        return { error: "runtime_id and participant_id required" };
      }
      try {
        const paths = resolvePaths(deps);
        return await checkHookInstallStatus({
          runtimeId: runtime_id,
          participantId: participant_id,
          userParticipantId: user_participant_id,
          projectRoot: paths.root(),
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
