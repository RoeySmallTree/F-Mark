import type { FastifyInstance } from "fastify";
import type { TodoEventRecord } from "@f-mark/shared";
import { readEvents } from "../../events/reader.js";
import {
  buildTodoListResponse,
  buildTodoSnapshot,
} from "../../services/events.js";
import type { TodoRouteContext } from "./context.js";

export function registerTodoReadRoute(
  app: FastifyInstance,
  context: TodoRouteContext,
): void {
  app.get<{
    Params: { id: string };
    Querystring: {
      assigned_to?: string;
      viewer?: string;
      path_id?: string;
      root?: string;
    };
  }>("/sessions/:id/todos", async (req, reply) => {
    const paths = await context.readPathsOrSend(req.query, reply);
    if (paths === null) return;
    if (!(await context.ensureSession(paths, req.params.id, reply))) return;
    const events = await readEvents(paths, req.params.id, { kinds: ["todo"] });
    return buildTodoListResponse(
      buildTodoSnapshot(events.filter(isTodoEvent)),
      req.query.assigned_to,
      req.query.viewer,
    );
  });
}

function isTodoEvent(event: { kind: string }): event is TodoEventRecord {
  return event.kind === "todo";
}
