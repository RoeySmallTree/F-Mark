import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { seqLog, LogLevel } from "../lib/seq-log.js";

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
  void seqLog("static renderer dir probe", {
    module: "static",
    here,
    probes,
  });
  for (const probe of probes) {
    if (probe.hasIndexHtml) return probe.candidate;
  }
  return null;
}

export async function registerStaticRoutes(app: FastifyInstance): Promise<void> {
  const dir = rendererDir();
  if (dir === null) {
    void seqLog(
      "static renderer dir not found, skipping registration",
      { module: "static" },
      LogLevel.Warning,
    );
    return;
  }
  void seqLog("static registering plugin", { module: "static", dir });
  await app.register(fastifyStatic, {
    root: dir,
    prefix: "/",
  });
  app.setNotFoundHandler(async (req, reply) => {
    const url = req.raw.url ?? "";
    const isApi =
      url.startsWith("/sessions") ||
      url.startsWith("/participants") ||
      url.startsWith("/guide") ||
      url.startsWith("/presets") ||
      url.startsWith("/skills") ||
      url.startsWith("/search") ||
      url === "/ws";
    void seqLog("static notFoundHandler {url}", {
      module: "static",
      url,
      method: req.method,
      isApi,
    });
    if (isApi) {
      reply.code(404);
      return { error: "not found" };
    }
    return reply.sendFile("index.html");
  });
  void seqLog("static registered", { module: "static", dir });
}
