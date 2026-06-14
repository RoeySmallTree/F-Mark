import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  EventKind,
  PostAccessRequestBody,
  PostAccessResponseBody,
  PostChoiceBody,
  PostChoicesBody,
  PostProseBody,
  PostSubagentOutputBody,
  PostSubagentRunBody,
  PostToolUseBody,
  PostTurnEndBody,
} from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { paths as makePaths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { readEvents } from "../events/reader.js";
import type { Bus } from "../ws/bus.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";
import { checkPathAgainstActive } from "./stalePath.js";
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
} from "../services/events.js";
import { publishEventWrites } from "../services/eventPublisher.js";

interface ProseBody extends PostProseBody {
  /** Hook envelope — when present, kernel verifies the path matches the
   *  active path and returns 409 STALE_PATH on mismatch (unless
   *  --quiet-cross-path-hooks was set on boot). */
  path?: string;
}

type ToolUseBody = PostToolUseBody & { path?: string };
type SubagentRunBody = PostSubagentRunBody & { path?: string };
type SubagentOutputBody = PostSubagentOutputBody & { path?: string };
type TurnEndBody = PostTurnEndBody & { path?: string };
type AccessRequestBody = PostAccessRequestBody & { path?: string };
type AccessResponseBody = PostAccessResponseBody & { path?: string };

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

export function registerEventRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
  getBus: () => Bus,
): void {
  const deps = normaliseDeps(pOrDeps);

  app.post<{ Params: { id: string }; Body: ProseBody }>(
    "/sessions/:id/events/prose",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["participant_id", "content"],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string" },
            content: { type: "string" },
            name: { type: "string" },
            /* New composable-prose fields. */
            append_to: { type: "string" },
            mode: { enum: ["content", "comment"] },
            lines: {
              type: "array",
              items: { type: "integer", minimum: 1 },
              minItems: 2,
              maxItems: 2,
            },
            // Strict boolean enum — see arbitrary note below.
            removed: { enum: [true, false] },
            /* File/diff comment fields — mutually exclusive with append_to/mode
               (enforced by validateProseFrontmatter). */
            file_path: { type: "string" },
            diff_hunk: { type: "string" },
            diff_base: { type: "string" },
            line_context: {
              type: "object",
              required: ["selected", "sha256"],
              additionalProperties: false,
              properties: {
                selected: { type: "string" },
                before: { type: "string" },
                after: { type: "string" },
                sha256: { type: "string" },
              },
            },
            in_reply_to: { type: "string" },
            supersedes: { type: "string" },
            mentions: {
              type: "array",
              items: {
                type: "object",
                required: ["participant_id", "display_name", "token"],
                additionalProperties: false,
                properties: {
                  participant_id: { type: "string" },
                  display_name: { type: "string" },
                  token: { type: "string" },
                },
              },
            },
            // `enum` form (not `type: "boolean"`) intentional: Fastify's default
            // AJV coerces `1`/`"true"`/`null` to booleans, defeating the strict
            // `=== true` semantics in serializeProse. `enum: [true, false]` is
            // checked after coercion would have applied and rejects non-booleans
            // with 400. See Task 6 / Task 2 reviewer's strict-boolean note.
            arbitrary: { enum: [true, false] },
            source: { enum: ["mcp", "hook", "manual"] },
            /* Hook STALE_PATH envelope — kernel verifies against active path. */
            path: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const sp = checkPathAgainstActive(req.body?.path, deps, {
        quietCrossPathHooks: deps.quietCrossPathHooks,
      });
      if (!sp.ok) {
        reply.code(sp.status);
        return sp.body;
      }
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const written = await writeProseEvent(p, req.params.id, req.body);
        publishEventWrites(getBus(), req.params.id, written.publish);
        return written.response;
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: ToolUseBody;
  }>(
    "/sessions/:id/events/tool-use",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: [
            "participant_id",
            "tool_name",
            "tool_use_id",
            "input",
            "success",
          ],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string", minLength: 1 },
            tool_name: { type: "string", minLength: 1, maxLength: 80 },
            tool_use_id: { type: "string", minLength: 1, maxLength: 80 },
            input: {},
            result: {},
            success: { type: "boolean" },
            duration_ms: { type: "number" },
            append_to: { type: "string", minLength: 1 },
            path: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const sp = checkPathAgainstActive((req.body as { path?: unknown })?.path, deps, {
        quietCrossPathHooks: deps.quietCrossPathHooks,
      });
      if (!sp.ok) { reply.code(sp.status); return sp.body; }
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const written = await writeToolUseEvent(p, req.params.id, req.body);
        publishEventWrites(getBus(), req.params.id, written.publish);
        return written.response;
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: SubagentRunBody;
  }>(
    "/sessions/:id/events/subagent-run",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: [
            "participant_id",
            "schema",
            "parent_participant_id",
            "parent_runtime_id",
            "subagent_id",
            "name",
            "status",
            "correlation_id",
            "sequence",
            "source",
            "source_confidence",
          ],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string", minLength: 1 },
            schema: { const: "fmark.subagent-run.v1" },
            parent_participant_id: { type: "string", minLength: 1 },
            parent_runtime_id: { anyOf: [{ type: "string" }, { type: "null" }] },
            parent_runtime_session_id: { type: "string" },
            parent_turn_id: { type: "string" },
            parent_tool_use_id: { type: "string" },
            subagent_id: { type: "string", minLength: 1, maxLength: 160 },
            name: { type: "string", minLength: 1, maxLength: 160 },
            role: { type: "string", maxLength: 160 },
            prompt_preview: { type: "string", maxLength: 4000 },
            status: {
              enum: [
                "started",
                "running",
                "completed",
                "failed",
                "cancelled",
                "unknown",
              ],
            },
            started_at: { type: "string" },
            ended_at: { type: "string" },
            transcript_path: { type: "string" },
            correlation_id: { type: "string", minLength: 1, maxLength: 180 },
            sequence: { type: "integer", minimum: 0 },
            source: {
              enum: [
                "hook",
                "transcript",
                "terminal-stream",
                "mcp-middleware",
                "unknown",
              ],
            },
            source_confidence: { enum: ["high", "medium", "low"] },
            raw: {},
            append_to: { type: "string", minLength: 1 },
            path: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const sp = checkPathAgainstActive(req.body?.path, deps, {
        quietCrossPathHooks: deps.quietCrossPathHooks,
      });
      if (!sp.ok) { reply.code(sp.status); return sp.body; }
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const written = await writeSubagentRunEvent(p, req.params.id, req.body);
        publishEventWrites(getBus(), req.params.id, written.publish);
        return written.response;
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: SubagentOutputBody;
  }>(
    "/sessions/:id/events/subagent-output",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: [
            "participant_id",
            "schema",
            "parent_participant_id",
            "parent_runtime_id",
            "subagent_id",
            "content",
            "correlation_id",
            "sequence",
            "source",
            "source_confidence",
          ],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string", minLength: 1 },
            schema: { const: "fmark.subagent-output.v1" },
            parent_participant_id: { type: "string", minLength: 1 },
            parent_runtime_id: { anyOf: [{ type: "string" }, { type: "null" }] },
            parent_runtime_session_id: { type: "string" },
            parent_turn_id: { type: "string" },
            parent_tool_use_id: { type: "string" },
            subagent_id: { type: "string", minLength: 1, maxLength: 160 },
            name: { type: "string", maxLength: 160 },
            content: { type: "string" },
            arbitrary: { enum: [true, false] },
            status: {
              enum: [
                "started",
                "running",
                "completed",
                "failed",
                "cancelled",
                "unknown",
              ],
            },
            correlation_id: { type: "string", minLength: 1, maxLength: 180 },
            sequence: { type: "integer", minimum: 0 },
            source: {
              enum: [
                "hook",
                "transcript",
                "terminal-stream",
                "mcp-middleware",
                "unknown",
              ],
            },
            source_confidence: { enum: ["high", "medium", "low"] },
            raw: {},
            append_to: { type: "string", minLength: 1 },
            path: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const sp = checkPathAgainstActive(req.body?.path, deps, {
        quietCrossPathHooks: deps.quietCrossPathHooks,
      });
      if (!sp.ok) { reply.code(sp.status); return sp.body; }
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const written = await writeSubagentOutputEvent(p, req.params.id, req.body);
        publishEventWrites(getBus(), req.params.id, written.publish);
        return written.response;
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: AccessRequestBody;
  }>(
    "/sessions/:id/events/access-request",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: [
            "participant_id",
            "schema",
            "request_id",
            "status",
            "request_type",
            "runtime_id",
            "hook_event_name",
            "title",
            "response_channel",
            "created_at",
          ],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string", minLength: 1 },
            schema: { const: "fmark.access-request.v1" },
            request_id: { type: "string", minLength: 1, maxLength: 120 },
            status: {
              enum: [
                "open",
                "approved",
                "denied",
                "resolved",
                "expired",
                "bridge-timeout",
              ],
            },
            request_type: {
              enum: [
                "permission",
                "trust",
                "config",
                "tool",
                "command",
                "unknown",
              ],
            },
            runtime_id: { anyOf: [{ type: "string" }, { type: "null" }] },
            runtime_session_id: { type: "string" },
            runtime_turn_id: { type: "string" },
            hook_event_name: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 1 },
            message: { type: "string" },
            tool_name: { type: "string" },
            tool_input: {},
            command: { type: "string" },
            permission_mode: { type: "string" },
            suggestions: { type: "array", items: {} },
            cwd: { type: "string" },
            transcript_path: { type: "string" },
            response_channel: { enum: ["hook", "terminal", "none"] },
            raw: {},
            created_at: { type: "string" },
            path: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const sp = checkPathAgainstActive(req.body?.path, deps, {
        quietCrossPathHooks: deps.quietCrossPathHooks,
      });
      if (!sp.ok) { reply.code(sp.status); return sp.body; }
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const written = await writeAccessRequestEvent(p, req.params.id, req.body);
        publishEventWrites(getBus(), req.params.id, written.publish);
        return written.response;
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: AccessResponseBody;
  }>(
    "/sessions/:id/events/access-response",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: [
            "participant_id",
            "schema",
            "request_id",
            "decision",
            "status",
            "delivered",
            "delivery",
            "responded_at",
          ],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string", minLength: 1 },
            schema: { const: "fmark.access-response.v1" },
            request_id: { type: "string", minLength: 1, maxLength: 120 },
            decision: {
              enum: ["approve", "deny", "resolved", "expired", "bridge-timeout"],
            },
            status: {
              enum: [
                "approved",
                "denied",
                "resolved",
                "expired",
                "bridge-timeout",
              ],
            },
            delivered: { type: "boolean" },
            delivery: { enum: ["hook", "terminal", "none"] },
            option_id: { type: "string" },
            terminal_input: { type: "string" },
            message: { type: "string" },
            error: { type: "string" },
            responded_at: { type: "string" },
            path: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const sp = checkPathAgainstActive(req.body?.path, deps, {
        quietCrossPathHooks: deps.quietCrossPathHooks,
      });
      if (!sp.ok) { reply.code(sp.status); return sp.body; }
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const written = await writeAccessResponseEvent(p, req.params.id, req.body);
        publishEventWrites(getBus(), req.params.id, written.publish);
        return written.response;
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: PostChoicesBody;
  }>(
    "/sessions/:id/events/choices",
    {
      schema: {
        body: {
          type: "object",
          required: ["participant_id", "id", "question", "options", "multi"],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string" },
            id: { type: "string" },
            question: { type: "string" },
            options: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "label"],
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  html: { type: "string", minLength: 1 },
                },
              },
            },
            multi: { type: "boolean" },
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
        const written = await writeChoicesEvent(p, req.params.id, req.body);
        publishEventWrites(getBus(), req.params.id, written.publish);
        return written.response;
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: PostChoiceBody;
  }>(
    "/sessions/:id/events/choice",
    {
      schema: {
        body: {
          type: "object",
          required: ["participant_id", "choices_id", "selected"],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string" },
            choices_id: { type: "string" },
            selected: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const written = await writeChoiceEvent(p, req.params.id, req.body);
        publishEventWrites(getBus(), req.params.id, written.publish);
        return written.response;
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: TurnEndBody;
  }>(
    "/sessions/:id/events/turn-end",
    {
      schema: {
        body: {
          type: "object",
          required: ["participant_id"],
          properties: {
            participant_id: { type: "string" },
            source: { enum: ["mcp", "hook", "manual"] },
            path: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const sp = checkPathAgainstActive(req.body?.path, deps, {
        quietCrossPathHooks: deps.quietCrossPathHooks,
      });
      if (!sp.ok) { reply.code(sp.status); return sp.body; }
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const written = await writeTurnEndEvent(p, req.params.id, req.body);
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
    Querystring: {
      since?: string;
      kinds?: string;
      participant?: string;
      path?: string;
    };
  }>("/sessions/:id/events", async (req, reply) => {
    const p =
      typeof req.query.path === "string" && req.query.path.length > 0
        ? makePaths(req.query.path)
        : resolvePaths(deps);
    if (!(await ensureSession(p, req.params.id, reply))) return;
    const kinds = req.query.kinds
      ?.split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0) as EventKind[] | undefined;
    const events = await readEvents(p, req.params.id, {
      since: req.query.since,
      kinds,
      participant: req.query.participant,
    });
    return { events };
  });
}
