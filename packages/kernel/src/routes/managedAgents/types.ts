import type { Paths } from "../../paths.js";
import type { AgentStateStore } from "../../services/agentState.js";
import type { TmuxManager } from "../../tmux/manager.js";
import type { PresenceTracker } from "../../presence/tracker.js";
import type { InputQueue } from "../../tmux/inputQueue.js";
import type { Bus } from "../../ws/bus.js";
import type { PathContextRef } from "../../paths/contextRef.js";
import type { checkHookInstallStatus as defaultCheckHookInstallStatus } from "../../hooksInstall/index.js";
import type { McpHttpController } from "../../mcp/http.js";

export interface ManagedAgentRootBinding {
  paths: Paths;
  state: AgentStateStore;
  /** Project root for tmux liveness lookups. `null` means active project. */
  tmuxRoot: string | null;
  /** WS envelope keys; omitted for the active root. */
  pathId?: string;
  revision?: number;
}

export interface ManagedAgentsDeps {
  paths: Paths;
  tmux: TmuxManager;
  tracker: PresenceTracker;
  projectRoot: string;
  /**
   * Shared per-pane input queue. Lifted to server scope (createServer)
   * so both `registerManagedAgentsRoutes` and `registerPaneWebSocket`
   * enqueue tmux sends against the same queue object, preventing byte-
   * level interleaving between kernel-injected slash commands and
   * overlay-typed WS input.
   */
  inputQueue: InputQueue;
  /**
   * Broadcast bus for managed-agent WS messages. Used to publish
   * `managed-agent.spawned`, `managed-agent.killed`, and
   * `managed-agent.terminal-spawned` after successful route operations,
   * so the renderer can update chip state without a manual list refresh.
   */
  bus: Bus;
  /**
   * Optional override for hook detection used by the spawn
   * route. Defaults to the production `checkHookInstallStatus`; tests inject
   * a fake to drive the kickoff send-keys path without touching real config
   * files.
   */
  checkHookInstallStatus?: typeof defaultCheckHookInstallStatus;
  /**
   * Environment used for runtime integration setup. Tests pass an isolated
   * HOME/CODEX_HOME here so auto-apply cannot mutate the developer's real
   * runtime config.
   */
  env?: NodeJS.ProcessEnv;
  /**
   * Optional multi-path ref. When wired with an active path, agent state
   * lives under ~/.config/f-mark/projects/<pathId>/agents/ instead of the
   * per-path <root>/.f-mark/agents/. Tests omit this and keep the legacy
   * per-path layout.
   */
  pathContextRef?: PathContextRef;
  authToken?: string | null;
  kernelPort?: number;
  mcpHttpController?: McpHttpController;
}
