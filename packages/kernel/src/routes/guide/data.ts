import type { FastifyReply, FastifyRequest } from "fastify";
import { listParticipants } from "../../participants.js";
import type { Paths } from "../../paths.js";
import { sessionExists } from "../../sessions.js";
import { resolvePaths, type PathDeps } from "../pathDeps.js";

export interface GuideQuery {
  session_id?: string;
  /** Backward-compat alias for `session_id`. */
  sessionId?: string;
  agent_id?: string;
  runtime_id?: string;
}

export interface GuideData {
  p: Paths;
  baseUrl: string;
  sessionId?: string;
  agentId?: string;
  runtimeId?: string;
  userParticipantId: string;
}

export async function guideData(
  deps: PathDeps,
  req: FastifyRequest<{ Querystring: GuideQuery }>,
  reply: FastifyReply,
): Promise<GuideData | null> {
  const p = resolvePaths(deps);
  const sessionId = req.query.session_id ?? req.query.sessionId;
  if (!(await validateSession(p, sessionId, reply))) return null;

  return {
    p,
    baseUrl: baseUrlFromRequest(req),
    sessionId,
    agentId: req.query.agent_id,
    runtimeId: req.query.runtime_id,
    userParticipantId: await firstUserParticipantId(p),
  };
}

async function validateSession(
  p: Paths,
  sessionId: string | undefined,
  reply: FastifyReply,
): Promise<boolean> {
  if (sessionId === undefined || (await sessionExists(p, sessionId))) {
    return true;
  }

  reply.code(404).send({ error: `session not found: ${sessionId}` });
  return false;
}

function baseUrlFromRequest(
  req: FastifyRequest<{ Querystring: GuideQuery }>,
): string {
  const host = req.headers.host ?? "localhost:7777";
  const xfProto = req.headers["x-forwarded-proto"];
  const proto =
    typeof xfProto === "string" && xfProto.length > 0 ? xfProto : "http";
  return `${proto}://${host}`;
}

async function firstUserParticipantId(p: Paths): Promise<string> {
  try {
    const parts = await listParticipants(p);
    for (const [id, part] of Object.entries(parts)) {
      if (part.kind === "user") return id;
    }
  } catch {
    // Fall back to the legacy placeholder below.
  }

  return "us-yourname";
}
