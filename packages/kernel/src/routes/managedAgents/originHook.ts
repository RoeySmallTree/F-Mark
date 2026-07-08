/**
 * Cookie-auth Origin/Host gate for mutating /managed-agents/* routes.
 *
 * Defence-in-depth per the v0.4 Security spec: any cookie-authenticated
 * mutating request must carry an `Origin` header whose host resolves to
 * `localhost`, `127.0.0.1`, or matches the request's own `Host` header.
 *
 * Bearer-authenticated requests (`Authorization: Bearer ...`) bypass the check,
 * because the bearer token is not silently sent by browsers across origins.
 * GETs are unaffected.
 */
export function makeManagedAgentsOriginHook(): (
  req: import("fastify").FastifyRequest,
  reply: import("fastify").FastifyReply,
) => Promise<void> {
  return async (req, reply) => {
    // Only scope this hook to /managed-agents/* URLs. We register globally
    // (Fastify hooks bubble), so we have to gate by prefix ourselves.
    if (!req.url.startsWith("/managed-agents")) return;
    if (req.method === "GET") return;
    const hasHeader = req.headers.authorization !== undefined;
    if (hasHeader) return;
    const cookieHeader = req.headers.cookie ?? "";
    const hasCookie = cookieHeader.includes("fmark_token=");
    if (!hasCookie) return;
    const origin = req.headers.origin;
    if (typeof origin !== "string" || origin.length === 0) {
      reply
        .code(403)
        .send({ error: "cookie-authenticated request missing Origin header" });
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      reply.code(403).send({ error: `invalid Origin header: ${origin}` });
      return;
    }
    const host = parsed.hostname;
    const rawHost = (req.headers.host ?? "").toString();
    const reqHost = rawHost.split(":")[0] ?? "";
    if (host !== "localhost" && host !== "127.0.0.1" && host !== reqHost) {
      reply.code(403).send({ error: `Origin ${origin} not allowed` });
    }
  };
}
