import Fastify, { type FastifyInstance } from "fastify";
import { VERSION } from "./config.js";
import { registerAuthHook } from "./auth.js";
import type { Paths } from "./paths.js";
import { registerParticipantRoutes } from "./routes/participants.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerEventRoutes } from "./routes/events.js";
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

  registerAuthHook(app, deps.token);

  app.get("/health", async () => ({
    status: "ok",
    version: VERSION,
  }));

  let busRef: Bus = { publish(_m: BusMessage) {} };
  app.register(async (instance) => {
    busRef = await registerWebSocket(instance);
  });

  registerParticipantRoutes(app, deps.paths);
  registerSessionRoutes(app, deps.paths);
  registerEventRoutes(app, deps.paths, () => busRef);
  app.register(registerStaticRoutes);

  return {
    app,
    getBus: () => busRef,
  };
}
