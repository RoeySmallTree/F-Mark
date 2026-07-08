import websocketPlugin from "@fastify/websocket";
import type { Paths } from "../paths.js";
import type { PathContextRef } from "../paths/contextRef.js";
import type { GlobalPaths } from "../paths/global.js";
import { createPresenceTracker, type PresenceTracker } from "../presence/tracker.js";
import { createFilesWatcher } from "../services/filesWatcher.js";
import type { TmuxManager } from "../tmux/manager.js";
import { registerWebSocket, type Bus, type BusMessage } from "../ws/bus.js";
import { wrapBusWithEnvelope } from "../ws/envelope.js";
import type { FastifyInstance } from "fastify";
import type { ServerDeps } from "./types.js";

export interface PathScopedRouteDeps {
  fallback: Paths;
  ref: PathContextRef | undefined;
  global: GlobalPaths | undefined;
  quietCrossPathHooks: boolean;
  getTmuxManager(): TmuxManager | null;
  token: string | null;
}

export class ServerRuntime {
  readonly tracker: PresenceTracker;
  private busRef: Bus = { publish(_m: BusMessage) {} };
  private tmuxRef: TmuxManager | null = null;

  constructor(
    private readonly app: FastifyInstance,
    private readonly deps: ServerDeps,
  ) {
    this.registerWebSocketBus();
    this.tracker = createPresenceTracker({
      broadcast: (m) => this.busRef.publish(m),
    });
    this.registerServerLifecycle();
  }

  getBus(): Bus {
    return this.busRef;
  }

  getTracker(): PresenceTracker {
    return this.tracker;
  }

  getTmuxManager(): TmuxManager | null {
    return this.tmuxRef;
  }

  setTmuxManager(tmux: TmuxManager): void {
    this.tmuxRef = tmux;
  }

  createPathDeps(): PathScopedRouteDeps {
    return {
      fallback: this.deps.paths,
      ref: this.deps.pathContextRef,
      global: this.deps.globalPaths,
      quietCrossPathHooks: this.deps.quietCrossPathHooks ?? false,
      getTmuxManager: () => this.tmuxRef,
      token: this.deps.token,
    };
  }

  publish(message: BusMessage): void {
    this.busRef.publish(message);
  }

  private registerWebSocketBus(): void {
    // Hoist @fastify/websocket to the root scope so BOTH /ws (global broadcast)
    // and /ws/pane (per-pane channel router) can register `{ websocket: true }`
    // routes against the same plugin instance.
    this.app.register(websocketPlugin);
    this.app.register(async (instance) => {
      const rawBus = registerWebSocket(instance);
      // Wrap once at the entry point so every publisher (presence tracker,
      // event routes, managed-agent routes, env-probe) emits messages with
      // the current pathId+revision envelope. Path-switched messages bypass
      // the wrap (they carry their own envelope and announce the switch).
      this.busRef = this.deps.pathContextRef
        ? wrapBusWithEnvelope(rawBus, this.deps.pathContextRef)
        : rawBus;
    });
  }

  private registerServerLifecycle(): void {
    const filesWatcher = createFilesWatcher({
      getRoot: () =>
        this.deps.pathContextRef
          ? (this.deps.pathContextRef.get().active?.root() ?? null)
          : this.deps.paths.root(),
      bus: { publish: (m) => this.busRef.publish(m) },
    });
    const presenceTicker = setInterval(() => this.tracker.tick(), 5_000);
    presenceTicker.unref();
    this.app.addHook("onClose", async () => {
      clearInterval(presenceTicker);
      filesWatcher.close();
    });
  }
}
