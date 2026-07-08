import type { FastifyInstance } from "fastify";
import type { PostTodoBody } from "@f-mark/shared";
import { writeTodoEvent } from "../../services/events.js";
import { createScopedWriteRunner } from "../events/scopedWrite.js";
import type { TodoRouteContext } from "./context.js";
import { TODO_EVENT_SCHEMA } from "./schema.js";

export function registerTodoWriteRoute(
  app: FastifyInstance,
  context: TodoRouteContext,
): void {
  const runScopedWrite = createScopedWriteRunner(context.deps, () => context.bus());

  app.post<{
    Params: { id: string };
    Body: PostTodoBody & { path_id?: string; root?: string };
  }>(
    "/sessions/:id/events/todo",
    { schema: TODO_EVENT_SCHEMA },
    async (req, reply) => {
      return runScopedWrite(req.body, req.params.id, reply, (paths) =>
        writeTodoEvent(paths, req.params.id, req.body),
      );
    },
  );
}
