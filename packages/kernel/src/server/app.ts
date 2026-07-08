import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { registerAuthHook } from "../auth.js";
import { VERSION } from "../config.js";
import { MAX_ATTACHMENT_BYTES } from "../routes/files.js";
import type { ServerDeps } from "./types.js";

export interface KernelAppBootstrap {
  app: FastifyInstance;
  initialProjectRoot: string;
  processApiEnabled: boolean;
}

export function createKernelApp(deps: ServerDeps): KernelAppBootstrap {
  const app = Fastify({
    logger: false,
    bodyLimit: MAX_ATTACHMENT_BYTES + 128 * 1024,
  });
  const processApiEnabled =
    deps.token !== null || deps.allowProcessApiNoAuth === true;
  const initialProjectRoot = getInitialProjectRoot(deps);

  registerLocalCors(app);
  registerAuthHook(app, deps.token);
  app.register(multipart, { limits: { fileSize: MAX_ATTACHMENT_BYTES } });
  registerBootstrapRoutes(app, deps, processApiEnabled);

  return { app, initialProjectRoot, processApiEnabled };
}

function getInitialProjectRoot(deps: ServerDeps): string {
  return deps.pathContextRef?.get().active?.root() ?? deps.paths.root();
}

function registerLocalCors(app: FastifyInstance): void {
  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (typeof origin !== "string") return;
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      return;
    }
    const isLocalOrigin =
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      (parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "::1");
    if (!isLocalOrigin) return;

    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
    );
    reply.header(
      "Access-Control-Expose-Headers",
      "Mcp-Session-Id, MCP-Protocol-Version, WWW-Authenticate",
    );
    reply.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    if (req.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });
}

function registerBootstrapRoutes(
  app: FastifyInstance,
  deps: ServerDeps,
  processApiEnabled: boolean,
): void {
  app.get("/health", async () => ({
    status: "ok",
    version: VERSION,
    processApiEnabled,
    devKernelRestartEnabled: deps.requestKernelRestart !== undefined,
    ...(deps.kernelIdentity !== undefined
      ? { kernel: deps.kernelIdentity }
      : {}),
  }));

  app.post("/dev/restart-kernel", async (_req, reply) => {
    if (deps.requestKernelRestart === undefined) {
      reply.code(404);
      return {
        error: "kernel restart is only available under the dev supervisor",
      };
    }
    reply.code(202).send({ status: "restarting" });
    setImmediate(() => deps.requestKernelRestart?.());
    return reply;
  });
}
