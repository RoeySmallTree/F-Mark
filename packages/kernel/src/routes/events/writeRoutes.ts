import type { FastifyInstance, FastifySchema } from "fastify";
import type { Paths } from "../../paths.js";
import {
  writeAccessRequestEvent,
  writeAccessResponseEvent,
  writeChoiceEvent,
  writeChoicesEvent,
  writeProseEvent,
  writeSubagentOutputEvent,
  writeSubagentRunEvent,
  writeToolUseEvent,
  writeTurnEndEvent,
} from "../../services/events.js";
import type { Bus } from "../../ws/bus.js";
import type { PathDeps } from "../pathDeps.js";
import { createScopedWriteRunner, type EventWriteResult } from "./scopedWrite.js";
import {
  accessRequestSchema,
  accessResponseSchema,
  choiceSchema,
  choicesSchema,
  proseSchema,
  subagentOutputSchema,
  subagentRunSchema,
  toolUseSchema,
  turnEndSchema,
} from "./schemas.js";
import type {
  AccessRequestBody,
  AccessResponseBody,
  ChoiceBody,
  ChoicesBody,
  ProseBody,
  ScopedBody,
  SubagentOutputBody,
  SubagentRunBody,
  ToolUseBody,
  TurnEndBody,
} from "./types.js";

type SessionParams = { id: string };

interface EventPostRoute<Body extends ScopedBody> {
  url: string;
  schema: FastifySchema;
  write: (p: Paths, sessionId: string, body: Body) => Promise<EventWriteResult>;
}

function registerScopedPost<Body extends ScopedBody>(
  app: FastifyInstance,
  runScopedWrite: ReturnType<typeof createScopedWriteRunner>,
  route: EventPostRoute<Body>,
): void {
  app.post<{ Params: SessionParams; Body: Body }>(
    route.url,
    { schema: route.schema },
    async (req, reply) => {
      const body = req.body as Body;
      return runScopedWrite(body, req.params.id, reply, (p) =>
        route.write(p, req.params.id, body),
      );
    },
  );
}

export function registerEventWriteRoutes(
  app: FastifyInstance,
  deps: PathDeps,
  getBus: () => Bus,
): void {
  const runScopedWrite = createScopedWriteRunner(deps, getBus);

  registerScopedPost<ProseBody>(app, runScopedWrite, {
    url: "/sessions/:id/events/prose",
    schema: proseSchema,
    write: writeProseEvent,
  });
  registerScopedPost<ToolUseBody>(app, runScopedWrite, {
    url: "/sessions/:id/events/tool-use",
    schema: toolUseSchema,
    write: writeToolUseEvent,
  });
  registerScopedPost<SubagentRunBody>(app, runScopedWrite, {
    url: "/sessions/:id/events/subagent-run",
    schema: subagentRunSchema,
    write: writeSubagentRunEvent,
  });
  registerScopedPost<SubagentOutputBody>(app, runScopedWrite, {
    url: "/sessions/:id/events/subagent-output",
    schema: subagentOutputSchema,
    write: writeSubagentOutputEvent,
  });
  registerScopedPost<AccessRequestBody>(app, runScopedWrite, {
    url: "/sessions/:id/events/access-request",
    schema: accessRequestSchema,
    write: writeAccessRequestEvent,
  });
  registerScopedPost<AccessResponseBody>(app, runScopedWrite, {
    url: "/sessions/:id/events/access-response",
    schema: accessResponseSchema,
    write: writeAccessResponseEvent,
  });
  registerScopedPost<ChoicesBody>(app, runScopedWrite, {
    url: "/sessions/:id/events/choices",
    schema: choicesSchema,
    write: writeChoicesEvent,
  });
  registerScopedPost<ChoiceBody>(app, runScopedWrite, {
    url: "/sessions/:id/events/choice",
    schema: choiceSchema,
    write: writeChoiceEvent,
  });
  registerScopedPost<TurnEndBody>(app, runScopedWrite, {
    url: "/sessions/:id/events/turn-end",
    schema: turnEndSchema,
    write: writeTurnEndEvent,
  });
}
