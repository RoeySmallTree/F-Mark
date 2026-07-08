import type { GetInboxResponse, MarkSeenRequest, MarkSeenResponse } from "@f-mark/shared";
import type { FastifyInstance } from "fastify";
import { markInboxSeen, readInbox } from "../../../compass/inbox.js";
import type { ManagedAgentsRouteContext } from "../routeContext.js";
import { requireSessionBinding } from "./sessionBinding.js";
import { requireBodyParticipantId } from "./participant.js";

interface InboxQuery {
  participant_id?: string;
  limit?: string;
  path_id?: string;
  root?: string;
}

export function registerManagedAgentInboxRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.get<{
    Params: { id: string };
    Querystring: InboxQuery;
  }>("/sessions/:id/inbox", async (req, reply) => {
    const sessionId = decodeURIComponent(req.params.id);
    const participant = requireBodyParticipantId(
      req.query.participant_id,
      reply,
    );
    if (!participant.ok) return participant.body;

    const scoped = await requireSessionBinding({
      context,
      reply,
      sessionId,
      scopeInput: req.query,
      required: false,
    });
    if (!scoped.ok) return scoped.body;

    const limit = parseLimit(req.query.limit, reply);
    if (!limit.ok) return limit.body;

    const snapshot = await readInbox({
      paths: scoped.binding.paths,
      state: scoped.binding.state,
      sessionId,
      participantId: participant.participantId,
      limit: limit.value,
      markSeen: false,
    });
    return publicInboxResponse(snapshot);
  });

  app.post<{
    Params: { id: string };
    Body: MarkSeenRequest;
  }>(
    "/sessions/:id/mark-seen",
    async (
      req,
      reply,
    ): Promise<MarkSeenResponse | { error: string }> => {
      const sessionId = decodeURIComponent(req.params.id);
      const participant = requireBodyParticipantId(
        req.body?.participant_id,
        reply,
      );
      if (!participant.ok) return participant.body;

      const scoped = await requireSessionBinding({
        context,
        reply,
        sessionId,
        scopeInput: req.body ?? {},
        required: false,
      });
      if (!scoped.ok) return scoped.body;

      const cursor = await markInboxSeen({
        paths: scoped.binding.paths,
        state: scoped.binding.state,
        sessionId,
        participantId: participant.participantId,
        timestamp: req.body?.timestamp,
      });
      return {
        session_id: sessionId,
        participant_id: participant.participantId,
        cursor,
      };
    },
  );
}

function parseLimit(
  raw: string | undefined,
  reply: import("fastify").FastifyReply,
): { ok: true; value: number | undefined } | { ok: false; body: { error: string } } {
  if (raw === undefined) return { ok: true, value: undefined };

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    reply.code(400);
    return { ok: false, body: { error: "limit must be a positive integer" } };
  }
  return { ok: true, value: Math.min(parsed, 100) };
}

function publicInboxResponse(
  snapshot: Awaited<ReturnType<typeof readInbox>>,
): GetInboxResponse {
  return {
    session_id: snapshot.session_id,
    participant_id: snapshot.participant_id,
    cursor_before: snapshot.cursor_before,
    cursor_after: snapshot.cursor_after,
    events: snapshot.events,
  };
}
