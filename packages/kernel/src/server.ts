import Fastify, { type FastifyInstance } from "fastify";
import { VERSION } from "./config.js";
import { registerAuthHook } from "./auth.js";
import { seqLog, LogLevel } from "./lib/seq-log.js";
import type { Paths } from "./paths.js";
import { registerParticipantRoutes } from "./routes/participants.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerTodoRoutes } from "./routes/todos.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerHtmlRoutes } from "./routes/html.js";
import { registerRawRoutes } from "./routes/raw.js";
import { registerPresetRoutes } from "./routes/presets.js";
import { registerSkillRoutes } from "./routes/skills.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerGuideRoute } from "./routes/guide.js";
import { registerStaticRoutes } from "./routes/static.js";
import { registerWebSocket, type Bus, type BusMessage } from "./ws/bus.js";

export interface ServerDeps {
  token: string | null;
  paths: Paths;
}

export interface CreatedServer {
  app: FastifyInstance;
  getBus(): Bus;
}

export function createServer(deps: ServerDeps): CreatedServer {
  const app = Fastify({ logger: false });

  void seqLog("server create", {
    module: "server",
    authConfigured: deps.token !== null,
    projectRoot: deps.paths.root(),
  });

  app.addHook("onRequest", async (req) => {
    void seqLog("request in {method} {url}", {
      module: "server",
      phase: "onRequest",
      method: req.method,
      url: req.url,
      headers: {
        upgrade: req.headers.upgrade,
        connection: req.headers.connection,
        accept: req.headers.accept,
      },
    });
  });

  app.addHook("onResponse", async (req, reply) => {
    const level =
      reply.statusCode >= 500
        ? LogLevel.Error
        : reply.statusCode >= 400
          ? LogLevel.Warning
          : LogLevel.Debug;
    void seqLog(
      "response out {method} {url} {statusCode}",
      {
        module: "server",
        phase: "onResponse",
        method: req.method,
        url: req.url,
        statusCode: reply.statusCode,
      },
      level,
    );
  });

  app.addHook("onError", async (req, reply, err) => {
    void seqLog(
      "handler error {method} {url}",
      {
        module: "server",
        phase: "onError",
        method: req.method,
        url: req.url,
        statusCode: reply.statusCode,
        errorMessage: err.message,
        errorName: err.name,
        errorStack: err.stack,
      },
      LogLevel.Error,
    );
  });

  registerAuthHook(app, deps.token);

  app.get("/health", async () => ({
    status: "ok",
    version: VERSION,
  }));

  let busRef: Bus = { publish(_m: BusMessage) {} };
  app.register(async (instance) => {
    busRef = await registerWebSocket(instance);
    void seqLog("websocket plugin ready", { module: "server" });
  });

  registerParticipantRoutes(app, deps.paths);
  registerSessionRoutes(app, deps.paths);
  registerEventRoutes(app, deps.paths, () => busRef);
  registerTodoRoutes(app, deps.paths, () => busRef);
  registerFileRoutes(app, deps.paths, () => busRef);
  registerHtmlRoutes(app, deps.paths, () => busRef);
  registerRawRoutes(app, deps.paths);
  registerPresetRoutes(app, deps.paths);
  registerSkillRoutes(app);
  registerSearchRoutes(app, deps.paths);
  registerGuideRoute(app, deps.paths);
  app.register(async (instance) => {
    await registerStaticRoutes(instance);
    void seqLog("static plugin ready", { module: "server" });
  });

  app.ready((err) => {
    if (err) {
      void seqLog(
        "fastify ready failed",
        { module: "server", errorMessage: err.message, errorStack: err.stack },
        LogLevel.Error,
      );
    } else {
      void seqLog("fastify ready ok", { module: "server" });
    }
  });

  return {
    app,
    getBus: () => busRef,
  };
}
