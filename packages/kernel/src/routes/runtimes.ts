import type { FastifyInstance } from "fastify";
import { isOfferableRuntimeId } from "@f-mark/shared";
import type { Paths } from "../paths.js";
import {
  loadRuntimes,
  offerableRuntimesFile,
  removeRuntime,
  upsertRuntime,
} from "../runtimes/registry.js";
import {
  ensureRuntimesDir,
  loadOfferableRuntimeRegistry,
} from "../runtimes/store.js";
import type { RuntimeEntryShape } from "../runtimes/validation.js";
import { DEFAULT_RUNTIMES } from "../runtimes/defaults.js";
import { normaliseDeps, type PathDeps } from "./pathDeps.js";

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
    return loadOfferableRuntimeRegistry(deps);
  });

  app.put<{ Params: { id: string }; Body: RuntimeEntryShape }>(
    "/runtimes/:id",
    async (req, reply) => {
      const id = req.params.id;
      if (!isValidRuntimeId(id)) {
        reply.code(400);
        return { error: "invalid runtime id" };
      }
      if (!isOfferableRuntimeId(id)) {
        reply.code(400);
        return { error: "runtime id is no longer supported" };
      }
      try {
        const dir = await ensureRuntimesDir(deps);
        await upsertRuntime(dir, id, req.body);
        return offerableRuntimesFile(await loadRuntimes(dir));
      } catch (err) {
        reply.code(400);
        return {
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/runtimes/:id",
    async (req, reply) => {
      const id = req.params.id;
      if (!isValidRuntimeId(id)) {
        reply.code(400);
        return { error: "invalid runtime id" };
      }
      if (id in DEFAULT_RUNTIMES) {
        reply.code(400);
        return { error: "built-in runtimes cannot be removed" };
      }
      const dir = await ensureRuntimesDir(deps);
      await removeRuntime(dir, id);
      return offerableRuntimesFile(await loadRuntimes(dir));
    },
  );
}
