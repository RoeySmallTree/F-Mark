import type { FastifyInstance, FastifyReply } from "fastify";
import type { EventKind, FileRefPayload } from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { writeEventFile } from "../events/writer.js";
import { validateNonProseAppendTo } from "../events/proseValidate.js";
import type { Bus, BusMessage } from "../ws/bus.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";

/** Upload size cap for the fastify-multipart plugin (consumed by
 *  server.ts at register time). 64 MiB is a conservative default; the
 *  user's WIP attachment feature can override per-route. Defined here
 *  so server.ts's import resolves cleanly. */
export const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024;

interface FileBody {
  participant_id: string;
  id: string;
  path: string;
  mime_type: string;
  description?: string;
  append_to?: string;
}

async function ensureSession(
  p: Paths,
  sessionId: string,
  reply: FastifyReply,
): Promise<boolean> {
  if (!(await sessionExists(p, sessionId))) {
    reply.code(404).send({ error: `session not found: ${sessionId}` });
    return false;
  }
  return true;
}

export function registerFileRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
  getBus: () => Bus,
): void {
  const deps = normaliseDeps(pOrDeps);

  function publish(
    sessionId: string,
    filename: string,
    kind: EventKind,
    participantId: string,
  ): void {
    const bus = getBus();
    const added: BusMessage = {
      type: "event_added",
      session_id: sessionId,
      filename,
      kind,
      participant_id: participantId,
    };
    bus.publish(added);
  }

  app.post<{ Params: { id: string }; Body: FileBody }>(
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
            description: { type: "string" },
            append_to: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const apCheck = validateNonProseAppendTo(req.body.append_to);
        if (!apCheck.ok) {
          reply.code(400);
          return { error: apCheck.error };
        }
        const { participant_id, ...rest } = req.body;
        const payload: FileRefPayload = {
          id: rest.id,
          path: rest.path,
          mime_type: rest.mime_type,
        };
        if (rest.description !== undefined) payload.description = rest.description;
        if (rest.append_to !== undefined) payload.append_to = rest.append_to;
        const filename = await writeEventFile(p, req.params.id, {
          participant_id,
          kind: "file",
          ext: "json",
          contents: JSON.stringify(payload, null, 2),
        });
        publish(req.params.id, filename, "file", participant_id);
        return {
          filename,
          timestamp: filename.split("_")[0]!,
          participant_id,
          kind: "file" as const,
        };
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );
}
