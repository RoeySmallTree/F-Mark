import type { FastifyInstance } from "fastify";
import type { TmuxManager } from "../tmux/manager.js";
import { createInputQueue, type InputQueue } from "../tmux/inputQueue.js";
import type { PaneHub } from "./paneHub.js";
import { PanePipeController } from "./pane/pipeController.js";
import { registerPaneSocketRoute } from "./pane/socketRoute.js";

export interface PaneWsRegistration {
  startPipe(paneId: string): Promise<void>;
  stopPipe(paneId: string): Promise<void>;
}

export interface PaneWsDeps {
  tmux: TmuxManager;
  hub: PaneHub;
  /**
   * Shared per-pane input queue. Lifted to server scope (createServer)
   * so this module and `registerManagedAgentsRoutes` enqueue tmux sends
   * against the same queue object, preventing byte-level interleaving
   * between overlay-typed input and kernel-injected slash commands.
   */
  inputQueue: InputQueue;
}

export function registerPaneWebSocket(
  app: FastifyInstance,
  deps: PaneWsDeps,
): PaneWsRegistration {
  const { tmux, hub, inputQueue } = deps;
  const pipes = new PanePipeController({
    tmux,
    hub,
    pipeQueue: createInputQueue(),
  });

  // Route registration is wrapped in `app.register(async (instance) => …)` so
  // it runs AFTER the websocket plugin has been loaded by the outer scope.
  // Without the wrapper, the route would be added before the plugin's onRoute
  // hook runs, and `{ websocket: true }` would silently degrade to a normal
  // HTTP handler — yielding "socket.close is not a function" when the handler
  // tries to call socket.close().
  app.register(async (instance) => {
    registerPaneSocketRoute(instance, { tmux, hub, inputQueue });
  });

  return {
    startPipe: (paneId) => pipes.startPipe(paneId),
    stopPipe: (paneId) => pipes.stopPipe(paneId),
  };
}
