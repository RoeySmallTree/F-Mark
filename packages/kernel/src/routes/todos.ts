import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  EventKind,
  TodoEventRecord,
  TodoPayload,
} from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { writeEventFile } from "../events/writer.js";
import { readEvents } from "../events/reader.js";
import type { Bus, BusMessage } from "../ws/bus.js";

interface TodoBody {
  participant_id: string;
  id: string;
  title: string;
  body?: string;
  status: "open" | "wip" | "done";
  assigned_to?: string;
  supersedes?: string;
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

export function registerTodoRoutes(
  app: FastifyInstance,
  p: Paths,
  getBus: () => Bus,
): void {
  function publish(
    sessionId: string,
    filename: string,
    kind: EventKind,
    participantId: string,
    supersedes?: string,
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
    if (typeof supersedes === "string") {
      bus.publish({
        type: "event_superseded",
        session_id: sessionId,
        filename: supersedes,
        supersedes: filename,
      });
    }
  }

  app.post<{ Params: { id: string }; Body: TodoBody }>(
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
          properties: {
            participant_id: { type: "string", minLength: 1 },
            id: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 1 },
            body: { type: "string" },
            status: { type: "string", enum: ["open", "wip", "done"] },
            assigned_to: { type: "string" },
            supersedes: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const { participant_id, ...rest } = req.body;
        const payload: TodoPayload = {
          id: rest.id,
          title: rest.title,
          status: rest.status,
        };
        if (rest.body !== undefined) payload.body = rest.body;
        if (rest.assigned_to !== undefined) payload.assigned_to = rest.assigned_to;
        if (rest.supersedes !== undefined) payload.supersedes = rest.supersedes;
        const filename = await writeEventFile(p, req.params.id, {
          participant_id,
          kind: "todo",
          ext: "json",
          contents: JSON.stringify(payload, null, 2),
        });
        publish(req.params.id, filename, "todo", participant_id, rest.supersedes);
        return {
          filename,
          timestamp: filename.split("_")[0]!,
          participant_id,
          kind: "todo" as const,
        };
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: { assigned_to?: string };
  }>(
    "/sessions/:id/todos",
    async (req, reply) => {
      if (!(await ensureSession(p, req.params.id, reply))) return;
      const events = await readEvents(p, req.params.id, { kinds: ["todo"] });
      const todoEvents = events.filter(
        (e): e is TodoEventRecord => e.kind === "todo",
      );

      // Latest version per id by timestamp
      const latestById = new Map<string, TodoEventRecord>();
      for (const e of todoEvents) {
        const id = (e.payload as TodoPayload).id;
        if (typeof id !== "string" || id.length === 0) continue;
        const existing = latestById.get(id);
        if (existing === undefined || e.timestamp > existing.timestamp) {
          latestById.set(id, e);
        }
      }

      // Apply supersession: drop any event whose filename is referenced by
      // another event's `supersedes`.
      const superseded = new Set<string>();
      for (const e of todoEvents) {
        const sup = (e.payload as TodoPayload).supersedes;
        if (typeof sup === "string" && sup.length > 0) superseded.add(sup);
      }

      const assignedTo = req.query.assigned_to;
      const buckets: Record<"open" | "wip" | "done", TodoPayload[]> = {
        open: [],
        wip: [],
        done: [],
      };
      // Preserve newest-first order: sort latest events desc by ts
      const survivors = Array.from(latestById.values())
        .filter((e) => !superseded.has(e.filename))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      for (const e of survivors) {
        const payload = e.payload as TodoPayload;
        if (payload.status !== "open" && payload.status !== "wip" && payload.status !== "done") {
          continue;
        }
        if (
          assignedTo !== undefined &&
          assignedTo.length > 0 &&
          payload.assigned_to !== assignedTo
        ) {
          continue;
        }
        buckets[payload.status].push(payload);
      }

      return buckets;
    },
  );
}
