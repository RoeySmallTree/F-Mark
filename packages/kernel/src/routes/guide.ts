import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import { guideData, type GuideQuery } from "./guide/data.js";
import { buildMcpGuide } from "./guide/mcpGuide.js";
import { buildRestGuide } from "./guide/restGuide.js";
import { normaliseDeps, type PathDeps } from "./pathDeps.js";

export { buildMcpGuide } from "./guide/mcpGuide.js";

export function registerGuideRoute(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
): void {
  const deps = normaliseDeps(pOrDeps);

  app.get<{ Querystring: GuideQuery }>("/guide", async (req, reply) => {
    const data = await guideData(deps, req, reply);
    if (data === null) return;
    reply.type("text/markdown; charset=utf-8");
    return buildMcpGuide({
      sessionId: data.sessionId,
      agentId: data.agentId,
      runtimeId: data.runtimeId,
      userParticipantId: data.userParticipantId,
    });
  });

  app.get<{ Querystring: GuideQuery }>("/guide-rest-variant", async (req, reply) => {
    const data = await guideData(deps, req, reply);
    if (data === null) return;
    let agentMd = "";
    try {
      agentMd = await readFile(data.p.agentMd(), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    reply.type("text/markdown; charset=utf-8");
    return buildRestGuide({
      baseUrl: data.baseUrl,
      agentMd,
      sessionId: data.sessionId,
      agentId: data.agentId,
      runtimeId: data.runtimeId,
      userParticipantId: data.userParticipantId,
    });
  });
}
