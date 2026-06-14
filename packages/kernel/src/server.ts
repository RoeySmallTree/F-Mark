import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import websocketPlugin from "@fastify/websocket";
import { VERSION } from "./config.js";
import { registerAuthHook } from "./auth.js";
import { seqLog, LogLevel } from "./lib/seq-log.js";
import type { Paths } from "./paths.js";
import { registerParticipantRoutes } from "./routes/participants.js";
import { registerAgentsRoutes } from "./routes/agents.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerTodoRoutes } from "./routes/todos.js";
import { MAX_ATTACHMENT_BYTES, registerFileRoutes } from "./routes/files.js";
import { registerHtmlRoutes } from "./routes/html.js";
import { registerAlternativesRoutes } from "./routes/alternatives.js";
import { registerFlowRoutes } from "./routes/flow.js";
import { registerRawRoutes } from "./routes/raw.js";
import { registerPresetRoutes } from "./routes/presets.js";
import { registerSkillRoutes } from "./routes/skills.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerGuideRoute } from "./routes/guide.js";
import { registerBestPracticesRoute } from "./routes/bestPractices.js";
import { registerRuntimeRoutes } from "./routes/runtimes.js";
import { registerEnvProbeRoute, realProbe } from "./routes/envProbe.js";
import { loadOfferableRuntimeRegistry } from "./runtimes/store.js";
import { registerStaticRoutes } from "./routes/static.js";
import { registerPresenceRoutes } from "./routes/presence.js";
import { registerManagedAgentsRoutes } from "./routes/managedAgents.js";
import { registerHookInstallRoutes } from "./routes/hookInstall.js";
import { registerPathRoutes } from "./routes/paths.js";
import { registerFsRoutes } from "./routes/fs.js";
import { registerFilesTreeRoute } from "./routes/filesTree.js";
import { registerFilesFavoritesRoutes } from "./routes/filesFavorites.js";
import { registerFilesContentRoute } from "./routes/filesContent.js";
import { registerFilesTextRoute } from "./routes/filesText.js";
import type { PathContextRef } from "./paths/contextRef.js";
import { createPresenceTracker, type PresenceTracker } from "./presence/tracker.js";
import { registerWebSocket, type Bus, type BusMessage } from "./ws/bus.js";
import { wrapBusWithEnvelope } from "./ws/envelope.js";
import { createPaneHub } from "./ws/paneHub.js";
import { registerPaneWebSocket } from "./ws/pane.js";
import { createTmuxManager, type TmuxManager } from "./tmux/manager.js";
import { realCommandRunner, type CommandRunner } from "./tmux/commandRunner.js";
import { createInputQueue } from "./tmux/inputQueue.js";
import { registerMcpHttpRoute } from "./mcp/http.js";
import { createFilesWatcher } from "./services/filesWatcher.js";

export interface ServerDeps {
  token: string | null;
  paths: Paths;
  /**
   * When true, allow process-spawning routes (managed-agents, pane WS, command
   * execution) even under `--no-auth`. Default false. Required because, with
   * auth disabled, *any* network-reachable client could otherwise spawn
   * arbitrary processes via the kernel.
   *
   * Has no effect when `token !== null` — bearer auth already gates those
   * routes in that mode.
   */
  allowProcessApiNoAuth?: boolean;
  /**
   * Optional CommandRunner override for tests. When omitted the server uses
   * `realCommandRunner()` (process spawn). Tests inject a fake to drive the
   * tmux manager without forking subprocesses.
   */
  commandRunner?: CommandRunner;
  /**
   * Optional multi-path context. When provided, registers the /paths routes
   * (GET /paths, POST /paths/active, etc.) backed by this ref. Tests that
   * don't need the new endpoints omit this and the routes stay unregistered
   * so global state.json isn't touched.
   */
  pathContextRef?: PathContextRef;
  /** When true, hooks from a backgrounded path (different pathId than
   *  active) are accepted instead of 409 STALE_PATH. CLI flag
   *  --quiet-cross-path-hooks. */
  quietCrossPathHooks?: boolean;
}

export interface CreatedServer {
  app: FastifyInstance;
  getBus(): Bus;
  getTracker(): PresenceTracker;
}

export function createServer(deps: ServerDeps): CreatedServer {
  const app = Fastify({ logger: false });
  const processApiEnabled =
    deps.token !== null || deps.allowProcessApiNoAuth === true;
  const initialProjectRoot =
    deps.pathContextRef?.get().active?.root() ?? deps.paths.root();

  void seqLog("server create", {
    module: "server",
    authConfigured: deps.token !== null,
    projectRoot: initialProjectRoot,
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

  registerAuthHook(app, deps.token);
  app.register(multipart, { limits: { fileSize: MAX_ATTACHMENT_BYTES } });

  app.get("/health", async () => ({
    status: "ok",
    version: VERSION,
    processApiEnabled,
  }));

  // Hoist @fastify/websocket to the root scope so BOTH /ws (global broadcast)
  // and /ws/pane (per-pane channel router) can register `{ websocket: true }`
  // routes against the same plugin instance. Previously the plugin was
  // registered inside an inner scope that only owned /ws, which caused
  // /ws/pane (registered on the outer app) to return HTTP 500.
  // (Phase 7 buddy review FAIL.)
  let busRef: Bus = { publish(_m: BusMessage) {} };
  app.register(websocketPlugin);
  app.register(async (instance) => {
    const rawBus = registerWebSocket(instance);
    // Wrap once at the entry point so every publisher (presence tracker,
    // event routes, managed-agent routes, env-probe) emits messages with
    // the current pathId+revision envelope. Path-switched messages bypass
    // the wrap (they carry their own envelope and announce the switch).
    busRef = deps.pathContextRef
      ? wrapBusWithEnvelope(rawBus, deps.pathContextRef)
      : rawBus;
    void seqLog("websocket plugin ready", { module: "server" });
  });

  const tracker = createPresenceTracker({
    broadcast: (m) => busRef.publish(m),
  });
  const filesWatcher = createFilesWatcher({
    getRoot: () =>
      deps.pathContextRef
        ? (deps.pathContextRef.get().active?.root() ?? null)
        : deps.paths.root(),
    bus: { publish: (m) => busRef.publish(m) },
  });
  const presenceTicker = setInterval(() => tracker.tick(), 5_000);
  presenceTicker.unref();
  app.addHook("onClose", async () => {
    clearInterval(presenceTicker);
    filesWatcher.close();
  });

  // Shared by routes that can change the active path before/after the tmux
  // manager is constructed. When process APIs are disabled this stays null.
  let tmuxRef: TmuxManager | null = null;

  // All path-scoped routes get { fallback, ref } so they resolve paths
  // against the active path when one is wired (multi-path mode), falling
  // back to deps.paths for the existing single-path test harness.
  const pathDeps = {
    fallback: deps.paths,
    ref: deps.pathContextRef,
    quietCrossPathHooks: deps.quietCrossPathHooks ?? false,
    getTmuxManager: () => tmuxRef,
    token: deps.token,
  };
  registerParticipantRoutes(app, pathDeps);
  registerAgentsRoutes(app, pathDeps);
  registerSessionRoutes(app, pathDeps, () => busRef);
  registerEventRoutes(app, pathDeps, () => busRef);
  registerTodoRoutes(app, pathDeps, () => busRef);
  registerFileRoutes(app, pathDeps, () => busRef);
  registerHtmlRoutes(app, pathDeps, () => busRef);
  registerAlternativesRoutes(app, pathDeps, () => busRef);
  registerFlowRoutes(app, pathDeps, () => busRef);
  registerRawRoutes(app, pathDeps);
  registerPresetRoutes(app, pathDeps);
  registerSkillRoutes(app);
  registerSearchRoutes(app, pathDeps);
  registerGuideRoute(app, pathDeps);
  registerBestPracticesRoute(app);
  registerRuntimeRoutes(app, pathDeps);
  registerPresenceRoutes(app, () => tracker);
  registerMcpHttpRoute(app, {
    token: deps.token,
    getProjectRoot: () =>
      deps.pathContextRef?.get().active?.root() ?? deps.paths.root(),
    env: process.env,
  });

  if (deps.pathContextRef) {
    registerPathRoutes(
      app,
      deps.pathContextRef,
      () => busRef,
      () => tmuxRef,
      deps.token,
      deps.paths,
    );
  }
  registerFsRoutes(app);
  registerFilesTreeRoute(app);
  registerFilesFavoritesRoutes(app, pathDeps);
  registerFilesContentRoute(app, pathDeps);
  registerFilesTextRoute(app, pathDeps);

  // /env-probe is a read-only PATH-detection endpoint; it lives outside the
  // process-API gate so the UI can render the install banner even under
  // --no-auth without --allow-process-api-no-auth.
  // The probe reads the registered runtime catalog (.f-mark/runtimes.json)
  // and probes each entry's configured `executable` via `which`. If the
  // registry can't be loaded yet, it falls back to an empty list — the UI
  // still gets tmux/installer detection.
  const probeFn = realProbe(async () => {
    try {
      // Read from the active path if wired, else the boot-time fallback.
      const cfg = await loadOfferableRuntimeRegistry(pathDeps);
      return Object.entries(cfg.runtimes).map(([id, entry]) => ({
        id,
        executable: entry.executable,
      }));
    } catch {
      return [];
    }
  });
  registerEnvProbeRoute(app, {
    probe: probeFn,
    broadcast: (m) => busRef.publish(m),
  });

  // Process-spawning routes are gated. They're always enabled when a token is
  // set (bearer auth protects them), and additionally enabled under --no-auth
  // only when the operator explicitly opts in with --allow-process-api-no-auth.
  // tmuxRef is declared above so path-changing routes can call tmux.rebind
  // through their getter. Stays null when the process API is disabled.
  if (processApiEnabled) {
    const tmux = createTmuxManager({
      runner: deps.commandRunner ?? realCommandRunner(),
      projectRoot: initialProjectRoot,
    });
    tmuxRef = tmux;
    // One per-pane input queue shared between /managed-agents/:id/command
    // and /ws/pane so kernel-injected keystrokes (slash commands) and
    // overlay-typed WS input cannot interleave at the tmux byte stream.
    // The queue keys on tmux session name; both subsystems enqueue against
    // the same key for the same pane.
    const paneInputQueue = createInputQueue();
    registerManagedAgentsRoutes(app, {
      paths: deps.paths,
      tmux,
      tracker,
      projectRoot: initialProjectRoot,
      inputQueue: paneInputQueue,
      // Pass a thin pass-through bus so route publishes go through the live
      // `busRef` (which is reassigned once the WebSocket plugin is ready).
      bus: { publish: (m) => busRef.publish(m) },
      pathContextRef: deps.pathContextRef,
      authToken: deps.token,
    });
    registerHookInstallRoutes(app, pathDeps);

    // Pane WS subsystem (separate channel router from the global broadcast bus).
    // Hub callbacks need access to the pane pipe functions; we wire them after
    // both objects exist via mutation, since the registration returns the pipe
    // controls and the hub deps need those controls.
    let pipeControls: { startPipe(id: string): Promise<void>; stopPipe(id: string): Promise<void> } = {
      startPipe: async () => {},
      stopPipe: async () => {},
    };
    const paneHub = createPaneHub({
      onStart: (id) => { void pipeControls.startPipe(id).catch(() => {}); },
      onStop: (id) => { void pipeControls.stopPipe(id).catch(() => {}); },
    });
    pipeControls = registerPaneWebSocket(app, { tmux, hub: paneHub, inputQueue: paneInputQueue });
  } else {
    // Fallback: respond with a clear 404 explaining why the API is off.
    const handler = async (
      _req: import("fastify").FastifyRequest,
      reply: import("fastify").FastifyReply,
    ): Promise<void> => {
      reply.code(404).send({
        error:
          "process-spawning API disabled. Pass --allow-process-api-no-auth to enable under --no-auth.",
      });
    };
    app.all("/managed-agents", handler);
    app.all("/managed-agents/*", handler);
  }

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
    getTracker: () => tracker,
  };
}
