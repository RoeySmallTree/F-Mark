import type { FastifyInstance } from "fastify";
import type { GlobalPaths } from "../paths/global.js";
import type { Paths } from "../paths.js";
import type { PathContextRef } from "../paths/contextRef.js";
import type { PresenceTracker } from "../presence/tracker.js";
import type { KernelInstanceIdentity } from "../services/kernelInstance.js";
import type { CommandRunner } from "../tmux/commandRunner.js";
import type { PromptDeliveryDelays } from "../tmux/manager.js";
import type { Bus } from "../ws/bus.js";

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
   * Optional prompt-delivery pacing override for tests. When omitted the tmux
   * manager uses the real settle/confirm delays around paste + Enter.
   */
  promptDelays?: PromptDeliveryDelays;
  /**
   * Optional multi-path context. When provided, registers the /paths routes
   * (GET /paths, POST /paths/active, etc.) backed by this ref. Tests that
   * don't need the new endpoints omit this and the routes stay unregistered
   * so global state.json isn't touched.
   */
  pathContextRef?: PathContextRef;
  /** Optional machine-wide config root override for tests. */
  globalPaths?: GlobalPaths;
  /** When true, hooks from a backgrounded path (different pathId than
   *  active) are accepted instead of 409 STALE_PATH. CLI flag
   *  --quiet-cross-path-hooks. */
  quietCrossPathHooks?: boolean;
  /** Dev supervisor hook. Present only under scripts/dev.mjs; when called,
   *  the kernel exits with a supervisor-recognised restart code. */
  requestKernelRestart?: () => void;
  /** Non-secret identity for singleton replacement checks. */
  kernelIdentity?: KernelInstanceIdentity;
}

export interface CreatedServer {
  app: FastifyInstance;
  getBus(): Bus;
  getTracker(): PresenceTracker;
}
