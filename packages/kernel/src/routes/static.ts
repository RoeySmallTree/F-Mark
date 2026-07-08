import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

function rendererDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "renderer"),
    join(here, "..", "..", "renderer"),
    join(here, "..", "..", "..", "renderer", "dist"),
    join(here, "..", "..", "..", "..", "renderer", "dist"),
  ];
  const probes = candidates.map((c) => ({
    candidate: c,
    hasIndexHtml: existsSync(join(c, "index.html")),
  }));
  /* Warn loudly when more than one candidate is present. The kernel build
     wipes `dist/renderer/` before tsc precisely so that in dev only the
     live `packages/renderer/dist/` is found; if BOTH exist, someone has
     either run `build:bundle` and then forgotten to refresh, or has a
     manual copy lying around. Either way the older one wins the lookup
     and silently masks renderer changes — exactly the meta-bug we hit
     during v0.4 ship. Surface it so it can't hide again. */
  const present = probes.filter((p) => p.hasIndexHtml);
  if (present.length > 1) {
  }
  for (const probe of probes) {
    if (probe.hasIndexHtml) return probe.candidate;
  }
  return null;
}

const API_PREFIXES = [
  "/sessions",
  "/participants",
  "/agents",
  "/managed-agents",
  "/runtimes",
  "/env-probe",
  "/guide",
  "/presets",
  "/skills",
  "/search",
  "/git",
  "/ws",
];

export async function registerStaticRoutes(app: FastifyInstance): Promise<void> {
  const dir = rendererDir();
  if (dir === null) {
    return;
  }
  await app.register(fastifyStatic, {
    root: dir,
    prefix: "/",
  });
  app.setNotFoundHandler(async (req, reply) => {
    const url = req.raw.url ?? "";
    const isApi = API_PREFIXES.some(
      (prefix) => url === prefix || url.startsWith(`${prefix}/`),
    );
    if (isApi) {
      reply.code(404);
      return { error: "not found" };
    }
    return reply.sendFile("index.html");
  });
}
