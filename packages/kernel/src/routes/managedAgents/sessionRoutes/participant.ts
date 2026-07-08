import type { FastifyReply } from "fastify";
import { isValidParticipantId } from "../../../participants.js";

export function requireBodyParticipantId(
  value: unknown,
  reply: FastifyReply,
): { ok: true; participantId: string } | { ok: false; body: { error: string } } {
  if (typeof value === "string" && isValidParticipantId(value)) {
    return { ok: true, participantId: value };
  }

  reply.code(400);
  return { ok: false, body: { error: "valid participant_id required" } };
}
