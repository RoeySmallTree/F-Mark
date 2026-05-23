import type { FastifyInstance, FastifyReply } from "fastify";
import type { EventKind, ProsePayload } from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { writeEventFile } from "../events/writer.js";
import { serializeProse } from "../events/prose.js";
import { serializeToolUse } from "../events/toolUse.js";
import { readEvents } from "../events/reader.js";
import type { Bus, BusMessage } from "../ws/bus.js";

interface ProseBody extends Omit<ProsePayload, "content"> {
  participant_id: string;
  content: string;
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
          properties: {
            participant_id: { type: "string" },
            content: { type: "string" },
            name: { type: "string" },
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
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const filename = await writeEventFile(p, req.params.id, {
          participant_id: req.body.participant_id,
          kind: "prose",
          ext: "md",
          contents: serializeProse(req.body),
        });
        publish(
          req.params.id,
          filename,
          "prose",
          req.body.participant_id,
          req.body.supersedes,
        );
        return {
          filename,
          timestamp: filename.split("_")[0]!,
          participant_id: req.body.participant_id,
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
            "success",
          ],
          properties: {
            participant_id: { type: "string", minLength: 1 },
            tool_name: { type: "string", minLength: 1 },
            tool_use_id: { type: "string", minLength: 1 },
            input: {},
            result: {},
            success: { type: "boolean" },
            duration_ms: { type: "number" },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const filename = await writeEventFile(p, req.params.id, {
          participant_id: req.body.participant_id,
          kind: "tool-use",
          ext: "json",
          contents: serializeToolUse({
            tool_name: req.body.tool_name,
            tool_use_id: req.body.tool_use_id,
            input: req.body.input ?? {},
            result: req.body.result,
            success: req.body.success,
            duration_ms: req.body.duration_ms,
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
    };
  }>(
    "/sessions/:id/events/choices",
    {
      schema: {
        body: {
          type: "object",
          required: ["participant_id", "id", "question", "options", "multi"],
          properties: {
            participant_id: { type: "string" },
            id: { type: "string" },
            question: { type: "string" },
            options: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "label"],
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                },
              },
            },
            multi: { type: "boolean" },
            supersedes: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
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
