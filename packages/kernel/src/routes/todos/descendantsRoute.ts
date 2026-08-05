import type { FastifyInstance } from "fastify";
import type { TodoEventRecord } from "@f-mark/shared";
import { readEvents } from "../../events/reader.js";
import {
  buildTodoSnapshot,
  findDescendants,
} from "../../services/events.js";
import type { TodoRouteContext } from "./context.js";

export function registerTodoDescendantsRoute(
  app: FastifyInstance,
  context: TodoRouteContext,
): void {
  app.get<{
    Params: { id: string; todoId: string };
    Querystring: { path_id?: string; root?: string };
  }>("/sessions/:id/todos/:todoId/descendants", async (req, reply) => {
    const paths = await context.readPathsOrSend(req.query, reply);
    if (paths === null) return;
    if (!(await context.ensureSession(paths, req.params.id, reply))) return;
    const events = await readEvents(paths, req.params.id, { kinds: ["todo"] });
    const snapshot = buildTodoSnapshot(events.filter(isTodoEvent));
    const descendants = findDescendants(snapshot, req.params.todoId);
    return { descendants: descendants.map((entry) => entry.payload.id) };
  });
}

function isTodoEvent(event: { kind: string }): event is TodoEventRecord {
  return event.kind === "todo";
}
