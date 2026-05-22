import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

function rendererDir(): string | null {
  const candidate = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "renderer",
  );
  return existsSync(candidate) ? candidate : null;
}

export async function registerStaticRoutes(app: FastifyInstance): Promise<void> {
  const dir = rendererDir();
  if (dir === null) return;
  await app.register(fastifyStatic, {
    root: dir,
    prefix: "/",
    wildcard: false,
    decorateReply: false,
  });
  app.setNotFoundHandler(async (req, reply) => {
    const url = req.raw.url ?? "";
    if (
      url.startsWith("/sessions") ||
      url.startsWith("/participants") ||
      url === "/ws"
    ) {
      reply.code(404);
      return { error: "not found" };
    }
    return reply.sendFile("index.html");
  });
}
