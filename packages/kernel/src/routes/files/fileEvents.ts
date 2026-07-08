import type { FastifyInstance } from "fastify";
import type { PostFileBody } from "@f-mark/shared";
import type { Bus } from "../../ws/bus.js";
import { writeFileRefEvent } from "../../services/events.js";
import type { PathDeps } from "../pathDeps.js";
import type { RootScope } from "../rootScope.js";
import { createScopedWriteRunner } from "../events/scopedWrite.js";
import { FILE_PREVIEW_KINDS } from "./metadata.js";

type FileEventBody = PostFileBody & RootScope;

const ROOT_SCOPE_PROPS = {
  path_id: { type: "string" },
  root: { type: "string" },
} as const;

export function registerFileEventRoute(
  app: FastifyInstance,
  deps: PathDeps,
  getBus: () => Bus,
): void {
  const runScopedWrite = createScopedWriteRunner(deps, getBus);

  app.post<{ Params: { id: string }; Body: FileEventBody }>(
    "/sessions/:id/events/file",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["participant_id", "id", "path", "mime_type"],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string", minLength: 1 },
            id: { type: "string", minLength: 1 },
            path: { type: "string", minLength: 1 },
            mime_type: { type: "string", minLength: 1 },
            display_name: { type: "string", minLength: 1 },
            size_bytes: { type: "integer", minimum: 0 },
            preview_kind: { type: "string", enum: FILE_PREVIEW_KINDS },
            description: { type: "string" },
            append_to: { type: "string", minLength: 1 },
            ...ROOT_SCOPE_PROPS,
          },
        },
      },
    },
    async (req, reply) =>
      runScopedWrite(req.body, req.params.id, reply, (p) =>
        writeFileRefEvent(p, req.params.id, req.body),
      ),
  );
}
