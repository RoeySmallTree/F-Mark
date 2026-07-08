import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAgentsRoutes } from "../routes/agents.js";
import { registerAlternativesRoutes } from "../routes/alternatives.js";
import { registerBestPracticesRoute } from "../routes/bestPractices.js";
import { registerEnvProbeRoute, realProbe } from "../routes/envProbe.js";
import { registerEventRoutes } from "../routes/events.js";
import { registerFileRoutes } from "../routes/files.js";
import { registerFilesContentRoute } from "../routes/filesContent.js";
import { registerFilesFavoritesRoutes } from "../routes/filesFavorites.js";
import { registerFilesTextRoute } from "../routes/filesText.js";
import { registerFilesTreeRoute } from "../routes/filesTree.js";
import { registerFlowRoutes } from "../routes/flow.js";
import { registerFsRoutes } from "../routes/fs.js";
import { registerGitRoutes } from "../routes/git.js";
import { registerGuideRoute } from "../routes/guide.js";
import { registerHtmlRoutes } from "../routes/html.js";
import { registerManagedAgentsRoutes } from "../routes/managedAgents.js";
import { registerParticipantRoutes } from "../routes/participants.js";
import { registerPathRoutes } from "../routes/paths.js";
import { registerPresetRoutes } from "../routes/presets.js";
import { registerPresenceRoutes } from "../routes/presence.js";
import { registerProfileRoutes } from "../routes/profile.js";
import { registerRawRoutes } from "../routes/raw.js";
import { registerRuntimeRoutes } from "../routes/runtimes.js";
import { registerSearchRoutes } from "../routes/search.js";
import { registerSessionRoutes } from "../routes/sessions.js";
import { registerSkillRoutes } from "../routes/skills.js";
import { registerStaticRoutes } from "../routes/static.js";
import { registerThemeRoutes } from "../routes/theme.js";
import { registerTodoRoutes } from "../routes/todos.js";
import { loadOfferableRuntimeRegistry } from "../runtimes/store.js";
import { registerMcpHttpRoute, type McpHttpController } from "../mcp/http.js";
import { createInputQueue } from "../tmux/inputQueue.js";
import { createTmuxManager } from "../tmux/manager.js";
import { realCommandRunner } from "../tmux/commandRunner.js";
import { createPaneHub } from "../ws/paneHub.js";
import { registerPaneWebSocket } from "../ws/pane.js";
import type { ServerRuntime, PathScopedRouteDeps } from "./runtime.js";
import type { ServerDeps } from "./types.js";

export interface RegisteredCoreRoutes {
  pathDeps: PathScopedRouteDeps;
  mcpHttpController: McpHttpController;
}

export function registerCoreRoutes(
  app: FastifyInstance,
  deps: ServerDeps,
  runtime: ServerRuntime,
): RegisteredCoreRoutes {
  const pathDeps = runtime.createPathDeps();
  const getBus = () => runtime.getBus();

  // All path-scoped routes get { fallback, ref } so they resolve paths
  // against the active path when one is wired (multi-path mode), falling
  // back to deps.paths for the existing single-path test harness.
  registerParticipantRoutes(app, pathDeps);
  registerProfileRoutes(app, {
    fallback: deps.paths,
    global: deps.globalPaths ?? deps.pathContextRef?.global(),
    ref: deps.pathContextRef,
  });
  registerAgentsRoutes(app, pathDeps);
  registerSessionRoutes(app, pathDeps, getBus);
  registerEventRoutes(app, pathDeps, getBus);
  registerTodoRoutes(app, pathDeps, getBus);
  registerFileRoutes(app, pathDeps, getBus);
  registerHtmlRoutes(app, pathDeps, getBus);
  registerAlternativesRoutes(app, pathDeps, getBus);
  registerFlowRoutes(app, pathDeps, getBus);
  registerRawRoutes(app, pathDeps);
  registerPresetRoutes(app, pathDeps);
  registerSkillRoutes(app);
  registerSearchRoutes(app, pathDeps);
  registerGuideRoute(app, pathDeps);
  registerThemeRoutes(app);
  registerBestPracticesRoute(app);
  registerRuntimeRoutes(app, pathDeps);
  registerPresenceRoutes(app, () => runtime.getTracker());
  const mcpHttpController = registerMcpHttpRoute(app, {
    token: deps.token,
    getProjectRoot: () =>
      deps.pathContextRef?.get().active?.root() ?? deps.paths.root(),
    env: process.env,
  });

  if (deps.pathContextRef) {
    registerPathRoutes(
      app,
      deps.pathContextRef,
      getBus,
      () => runtime.getTmuxManager(),
      deps.token,
      deps.paths,
    );
  }
  registerFsRoutes(app);
  registerFilesTreeRoute(app, pathDeps);
  registerFilesFavoritesRoutes(app, pathDeps);
  registerFilesContentRoute(app, pathDeps);
  registerFilesTextRoute(app, pathDeps);
  registerGitRoutes(app, pathDeps);
  registerEnvProbe(app, pathDeps, runtime);

  return { pathDeps, mcpHttpController };
}

export function registerProcessApiRoutes(
  app: FastifyInstance,
  deps: ServerDeps,
  runtime: ServerRuntime,
  pathDeps: PathScopedRouteDeps,
  options: {
    initialProjectRoot: string;
    mcpHttpController: McpHttpController;
    processApiEnabled: boolean;
  },
): void {
  // Process-spawning routes are gated. They're always enabled when a token is
  // set (bearer auth protects them), and additionally enabled under --no-auth
  // only when the operator explicitly opts in with --allow-process-api-no-auth.
  if (!options.processApiEnabled) {
    registerProcessApiDisabledRoutes(app);
    return;
  }

  const tmux = createTmuxManager({
    runner: deps.commandRunner ?? realCommandRunner(),
    projectRoot: options.initialProjectRoot,
    ...(deps.promptDelays !== undefined
      ? { promptDelays: deps.promptDelays }
      : {}),
  });
  runtime.setTmuxManager(tmux);
  // One per-pane input queue shared between /managed-agents/:id/command
  // and /ws/pane so kernel-injected keystrokes (slash commands) and
  // overlay-typed WS input cannot interleave at the tmux byte stream.
  // The queue keys on tmux session name; both subsystems enqueue against
  // the same key for the same pane.
  const paneInputQueue = createInputQueue();
  registerManagedAgentsRoutes(app, {
    paths: deps.paths,
    tmux,
    tracker: runtime.getTracker(),
    projectRoot: options.initialProjectRoot,
    inputQueue: paneInputQueue,
    // Pass a thin pass-through bus so route publishes go through the live
    // `busRef` (which is reassigned once the WebSocket plugin is ready).
    bus: { publish: (m) => runtime.publish(m) },
    pathContextRef: deps.pathContextRef,
    authToken: deps.token,
    kernelPort: deps.kernelIdentity?.port,
    mcpHttpController: options.mcpHttpController,
  });
  registerPaneWs(app, tmux, paneInputQueue);
}

export function registerStaticAssets(app: FastifyInstance): void {
  app.register(async (instance) => {
    await registerStaticRoutes(instance);
  });
}

function registerEnvProbe(
  app: FastifyInstance,
  pathDeps: PathScopedRouteDeps,
  runtime: ServerRuntime,
): void {
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
    broadcast: (m) => runtime.publish(m),
  });
}

function registerProcessApiDisabledRoutes(app: FastifyInstance): void {
  // Fallback: respond with a clear 404 explaining why the API is off.
  const handler = async (
    _req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    reply.code(404).send({
      error:
        "process-spawning API disabled. Pass --allow-process-api-no-auth to enable under --no-auth.",
    });
  };
  app.all("/managed-agents", handler);
  app.all("/managed-agents/*", handler);
}

function registerPaneWs(
  app: FastifyInstance,
  tmux: Parameters<typeof registerPaneWebSocket>[1]["tmux"],
  inputQueue: Parameters<typeof registerPaneWebSocket>[1]["inputQueue"],
): void {
  // Pane WS subsystem (separate channel router from the global broadcast bus).
  // Hub callbacks need access to the pane pipe functions; we wire them after
  // both objects exist via mutation, since the registration returns the pipe
  // controls and the hub deps need those controls.
  let pipeControls: {
    startPipe(id: string): Promise<void>;
    stopPipe(id: string): Promise<void>;
  } = {
    startPipe: async () => {},
    stopPipe: async () => {},
  };
  const paneHub = createPaneHub({
    onStart: (id) => {
      void pipeControls.startPipe(id).catch(() => {});
    },
    onStop: (id) => {
      void pipeControls.stopPipe(id).catch(() => {});
    },
  });
  pipeControls = registerPaneWebSocket(app, {
    tmux,
    hub: paneHub,
    inputQueue,
  });
}
