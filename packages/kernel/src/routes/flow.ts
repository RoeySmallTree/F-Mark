import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  EventKind,
  FlowEdge,
  FlowNode,
  FlowPayload,
} from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { writeEventFile } from "../events/writer.js";
import type { Bus, BusMessage } from "../ws/bus.js";

interface FlowBody extends FlowPayload {
  participant_id: string;
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

function validateGraph(nodes: FlowNode[], edges: FlowEdge[]): void {
  const ids = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) {
      throw new Error(`duplicate node id: ${n.id}`);
    }
    ids.add(n.id);
  }
  for (const e of edges) {
    if (!ids.has(e.source)) {
      throw new Error(`edge ${e.id} references missing node: ${e.source}`);
    }
    if (!ids.has(e.target)) {
      throw new Error(`edge ${e.id} references missing node: ${e.target}`);
    }
  }
}

export function registerFlowRoutes(
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

  app.post<{ Params: { id: string }; Body: FlowBody }>(
    "/sessions/:id/events/flow",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["participant_id", "id", "nodes", "edges"],
          properties: {
            participant_id: { type: "string", minLength: 1 },
            id: { type: "string", minLength: 1 },
            title: { type: "string" },
            supersedes: { type: "string" },
            nodes: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "label"],
                properties: {
                  id: { type: "string", minLength: 1 },
                  label: { type: "string" },
                  title: { type: "string" },
                  content: { type: "string" },
                  popover: {
                    type: "object",
                    required: ["html"],
                    properties: {
                      html: { type: "string" },
                      css: { type: "string" },
                      js: { type: "string" },
                    },
                  },
                  itemType: {
                    type: "string",
                    enum: ["default", "info", "success", "danger", "disabled"],
                  },
                  // `enum: [true, false]` matches the same strict-boolean trick
                  // used in routes/events.ts for prose `arbitrary` — avoids
                  // Fastify/AJV's default-coercion behavior.
                  focused: { enum: [true, false] },
                  position: {
                    type: "object",
                    required: ["x", "y"],
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                    },
                  },
                },
              },
            },
            edges: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "source", "target"],
                properties: {
                  id: { type: "string", minLength: 1 },
                  source: { type: "string", minLength: 1 },
                  target: { type: "string", minLength: 1 },
                  label: { type: "string" },
                  style: {
                    type: "string",
                    enum: ["solid", "dashed", "dotted", "flowing"],
                  },
                  type: {
                    type: "string",
                    enum: ["default", "info", "success", "danger"],
                  },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const { participant_id, supersedes, ...rest } = req.body;
        const payload: FlowPayload =
          supersedes !== undefined ? { ...rest, supersedes } : rest;
        validateGraph(payload.nodes, payload.edges);
        const filename = await writeEventFile(p, req.params.id, {
          participant_id,
          kind: "flow",
          ext: "json",
          contents: JSON.stringify(payload, null, 2),
        });
        publish(req.params.id, filename, "flow", participant_id, supersedes);
        return {
          filename,
          timestamp: filename.split("_")[0]!,
          participant_id,
          kind: "flow" as const,
        };
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );
}
