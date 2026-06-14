import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  PostTodoBody,
  TodoEventRecord,
} from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { readEvents } from "../events/reader.js";
import type { Bus } from "../ws/bus.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";
import {
  buildTodoListResponse as buildTodoListResponseFromService,
  buildTodoSnapshot as buildTodoSnapshotFromService,
  writeTodoEvent,
} from "../services/events.js";
import { publishEventWrites } from "../services/eventPublisher.js";

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

export function registerTodoRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
  getBus: () => Bus,
): void {
  const deps = normaliseDeps(pOrDeps);

  app.post<{ Params: { id: string }; Body: PostTodoBody }>(
    "/sessions/:id/events/todo",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["participant_id", "id", "title", "status"],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string", minLength: 1 },
            id: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 1 },
            body: { type: "string" },
            status: {
              type: "string",
              enum: ["open", "wip", "done", "removed"],
            },
            assigned_to: { type: "string" },
            parent_id: { type: "string" },
            supersedes: { type: "string" },
            append_to: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const written = await writeTodoEvent(p, req.params.id, req.body);
        publishEventWrites(getBus(), req.params.id, written.publish);
        return written.response;
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: { assigned_to?: string; viewer?: string };
  }>(
    "/sessions/:id/todos",
    async (req, reply) => {
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      const events = await readEvents(p, req.params.id, { kinds: ["todo"] });
      const todoEvents = events.filter(
        (e): e is TodoEventRecord => e.kind === "todo",
      );

      const assignedTo = req.query.assigned_to;
      const viewer = req.query.viewer;
      return buildTodoListResponseFromService(
        buildTodoSnapshotFromService(todoEvents),
        assignedTo,
        viewer,
      );
    },
  );
}
