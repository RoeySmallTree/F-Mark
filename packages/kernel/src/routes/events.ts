import type { FastifyInstance, FastifyReply } from "fastify";
import type { EventKind, ProsePayload, ProseTarget } from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { writeEventFile } from "../events/writer.js";
import { serializeProse } from "../events/prose.js";
import { serializeToolUse } from "../events/toolUse.js";
import { readEvents } from "../events/reader.js";
import {
  validateProseFrontmatter,
  validateNonProseAppendTo,
} from "../events/proseValidate.js";
import type { Bus, BusMessage } from "../ws/bus.js";

interface ProseBody extends Omit<ProsePayload, "content"> {
  participant_id: string;
  content: string;
  /** Legacy field accepted for back-compat. Normalised to `append_to` +
   *  `mode: "comment"` + `lines` before validation / serialization. */
  target?: ProseTarget;
}

/**
 * Translate a legacy `{ target: { file, lines? } }` request body to the
 * new `append_to + mode: "comment" + lines` shape. Returns either the
 * normalised body or a 400 reason if the body mixes legacy + new fields.
 */
function normaliseProseBody(
  body: ProseBody,
): { ok: true; body: ProseBody } | { ok: false; error: string } {
  const hasLegacy = body.target !== undefined && body.target !== null;
  const hasNew =
    body.append_to !== undefined ||
    body.mode !== undefined ||
    body.lines !== undefined;
  if (hasLegacy && hasNew) {
    return {
      ok: false,
      error: "request body must not contain both legacy `target` and new `append_to`/`mode`/`lines`",
    };
  }
  if (!hasLegacy) return { ok: true, body };
  const t = body.target!;
  const out: ProseBody = { ...body };
  delete out.target;
  out.append_to = t.file;
  out.mode = "comment";
  if (t.lines !== undefined) out.lines = t.lines;
  return { ok: true, body: out };
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

export function registerEventRoutes(
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
            /* Legacy field — still accepted, normalised on the server. */
            target: {
              type: "object",
              required: ["file"],
              properties: {
                file: { type: "string" },
                lines: {
                  type: "array",
                  items: { type: "integer" },
                  minItems: 2,
                  maxItems: 2,
                },
              },
            },
            in_reply_to: { type: "string" },
            supersedes: { type: "string" },
            // `enum` form (not `type: "boolean"`) intentional: Fastify's default
            // AJV coerces `1`/`"true"`/`null` to booleans, defeating the strict
            // `=== true` semantics in serializeProse. `enum: [true, false]` is
            // checked after coercion would have applied and rejects non-booleans
            // with 400. See Task 6 / Task 2 reviewer's strict-boolean note.
            arbitrary: { enum: [true, false] },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await ensureSession(p, req.params.id, reply))) return;
      const normalised = normaliseProseBody(req.body);
      if (!normalised.ok) {
        reply.code(400);
        return { error: normalised.error };
      }
      const body = normalised.body;
      const validation = validateProseFrontmatter({
        content: body.content,
        name: body.name,
        append_to: body.append_to,
        mode: body.mode,
        lines: body.lines,
        removed: body.removed,
        /* legacy `target` is already normalised away above */
      });
      if (!validation.ok) {
        reply.code(400);
        return { error: validation.error };
      }
      try {
        const filename = await writeEventFile(p, req.params.id, {
          participant_id: body.participant_id,
          kind: "prose",
          ext: "md",
          contents: serializeProse(body),
        });
        publish(
          req.params.id,
          filename,
          "prose",
          body.participant_id,
          body.supersedes,
        );
        return {
          filename,
          timestamp: filename.split("_")[0]!,
          participant_id: body.participant_id,
          kind: "prose" as const,
        };
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      participant_id: string;
      tool_name: string;
      tool_use_id: string;
      input: unknown;
      result?: unknown;
      success: boolean;
      duration_ms?: number;
      append_to?: string;
    };
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
            tool_name: { type: "string", minLength: 1 },
            tool_use_id: { type: "string", minLength: 1 },
            input: {},
            result: {},
            success: { type: "boolean" },
            duration_ms: { type: "number" },
            append_to: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const apCheck = validateNonProseAppendTo(req.body.append_to);
        if (!apCheck.ok) {
          reply.code(400);
          return { error: apCheck.error };
        }
        const filename = await writeEventFile(p, req.params.id, {
          participant_id: req.body.participant_id,
          kind: "tool-use",
          ext: "json",
          contents: serializeToolUse({
            tool_name: req.body.tool_name,
            tool_use_id: req.body.tool_use_id,
            input: req.body.input,
            result: req.body.result,
            success: req.body.success,
            duration_ms: req.body.duration_ms,
            append_to: req.body.append_to,
          }),
        });
        publish(req.params.id, filename, "tool-use", req.body.participant_id);
        return {
          filename,
          timestamp: filename.split("_")[0]!,
          participant_id: req.body.participant_id,
          kind: "tool-use" as const,
        };
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      participant_id: string;
      id: string;
      question: string;
      options: { id: string; label: string }[];
      multi: boolean;
      supersedes?: string;
      append_to?: string;
    };
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
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const apCheck = validateNonProseAppendTo(req.body.append_to);
        if (!apCheck.ok) {
          reply.code(400);
          return { error: apCheck.error };
        }
        const { participant_id, supersedes, ...rest } = req.body;
        const filename = await writeEventFile(p, req.params.id, {
          participant_id,
          kind: "choices",
          ext: "json",
          contents: JSON.stringify(
            supersedes !== undefined ? { ...rest, supersedes } : rest,
            null,
            2,
          ),
        });
        publish(req.params.id, filename, "choices", participant_id, supersedes);
        return {
          filename,
          timestamp: filename.split("_")[0]!,
          participant_id,
          kind: "choices" as const,
        };
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: { participant_id: string; choices_id: string; selected: string[] };
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
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const { participant_id, ...rest } = req.body;
        const filename = await writeEventFile(p, req.params.id, {
          participant_id,
          kind: "choice",
          ext: "json",
          contents: JSON.stringify(rest, null, 2),
        });
        publish(req.params.id, filename, "choice", participant_id);
        return {
          filename,
          timestamp: filename.split("_")[0]!,
          participant_id,
          kind: "choice" as const,
        };
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: { participant_id: string };
  }>(
    "/sessions/:id/events/turn-end",
    {
      schema: {
        body: {
          type: "object",
          required: ["participant_id"],
          additionalProperties: false,
          properties: { participant_id: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const filename = await writeEventFile(p, req.params.id, {
          participant_id: req.body.participant_id,
          kind: "turn-end",
          ext: "json",
          contents: JSON.stringify(
            { participant_id: req.body.participant_id },
            null,
            2,
          ),
        });
        publish(
          req.params.id,
          filename,
          "turn-end",
          req.body.participant_id,
        );
        return {
          filename,
          timestamp: filename.split("_")[0]!,
          participant_id: req.body.participant_id,
          kind: "turn-end" as const,
        };
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: { since?: string; kinds?: string; participant?: string };
  }>("/sessions/:id/events", async (req, reply) => {
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
