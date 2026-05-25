import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import {
  loadRuntimes,
  removeRuntime,
  upsertRuntime,
} from "../runtimes/registry.js";
import type { RuntimeEntryShape } from "../runtimes/validation.js";
import { DEFAULT_RUNTIMES } from "../runtimes/defaults.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";

const RUNTIME_ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;

function isValidRuntimeId(id: string): boolean {
  return RUNTIME_ID_RE.test(id);
}

export function registerRuntimeRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
): void {
  const deps = normaliseDeps(pOrDeps);

  app.get("/runtimes", async () => {
    const p = resolvePaths(deps);
    return loadRuntimes(p.fmarkDir());
  });

  app.put<{ Params: { id: string }; Body: RuntimeEntryShape }>(
    "/runtimes/:id",
    async (req, reply) => {
      const p = resolvePaths(deps);
      const id = req.params.id;
      if (!isValidRuntimeId(id)) {
        reply.code(400);
        return { error: "invalid runtime id" };
      }
      try {
        await upsertRuntime(p.fmarkDir(), id, req.body);
      } catch (err) {
        reply.code(400);
        return {
          error: err instanceof Error ? err.message : String(err),
        };
      }
      return loadRuntimes(p.fmarkDir());
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/runtimes/:id",
    async (req, reply) => {
      const p = resolvePaths(deps);
      const id = req.params.id;
      if (!isValidRuntimeId(id)) {
        reply.code(400);
        return { error: "invalid runtime id" };
      }
      if (id in DEFAULT_RUNTIMES) {
        reply.code(400);
        return { error: "built-in runtimes cannot be removed" };
      }
      await removeRuntime(p.fmarkDir(), id);
      return loadRuntimes(p.fmarkDir());
    },
  );
}
