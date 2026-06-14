import type { FastifyInstance } from "fastify";
import type { HookInstallQuery, HookInstallScope } from "@f-mark/shared";
import type { Paths } from "../paths.js";
import {
  applyHookInstall,
  checkHookInstallStatus,
  renderInstallInstructions,
} from "../hooksInstall/index.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";

export function registerHookInstallRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
): void {
  const deps = normaliseDeps(pOrDeps);
  app.get<{ Querystring: Partial<HookInstallQuery> }>(
    "/managed-agents/hook-install-status",
    async (req, reply) => {
      const { runtime_id, participant_id, user_participant_id } = req.query;
      if (!runtime_id) {
        reply.code(400);
        return { error: "runtime_id required" };
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
  app.post<{ Querystring: Partial<HookInstallQuery> }>(
    "/managed-agents/hook-install-instructions",
    async (req, reply) => {
      const { runtime_id, participant_id, user_participant_id } = req.query;
      if (!runtime_id) {
        reply.code(400);
        return { error: "runtime_id required" };
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
  app.post<{
    Querystring: Partial<HookInstallQuery>;
    Body: { scope?: HookInstallScope };
  }>(
    "/managed-agents/hook-install-apply",
    async (req, reply) => {
      const { runtime_id, participant_id, user_participant_id } = req.query;
      const scope = req.body?.scope;
      if (!runtime_id || !scope) {
        reply.code(400);
        return { error: "runtime_id and scope required" };
      }
      if (scope !== "local" && scope !== "global") {
        reply.code(400);
        return { error: "scope must be local or global" };
      }
      try {
        const paths = resolvePaths(deps);
        return await applyHookInstall({
          runtimeId: runtime_id,
          participantId: participant_id,
          userParticipantId: user_participant_id,
          scope,
          projectRoot: paths.root(),
        });
      } catch (e: any) {
        reply.code(400);
        return { error: e.message };
      }
    },
  );
}
