import type { IntegrationStatus } from "./integrations.js";
import type { CurrentRuntimeState } from "./runtimeAdapters.js";

export type PresenceState =
  | "launching"
  | "online"
  | "stale"
  | "offline"
  | "pane-dead"
  | "hook-not-installed";

export const PRESENCE_STATES = {
  launching: "launching",
  online: "online",
  stale: "stale",
  offline: "offline",
  paneDead: "pane-dead",
  hookNotInstalled: "hook-not-installed",
} as const satisfies Record<string, PresenceState>;

export type AgentActivityState =
  | "idle"
  | "running"
  | "notified"
  | "turn-ended"
  | "access-pending";

export const AGENT_ACTIVITY_STATES = {
  idle: "idle",
  running: "running",
  notified: "notified",
  turnEnded: "turn-ended",
  accessPending: "access-pending",
} as const satisfies Record<string, AgentActivityState>;

export interface ManagedAgent {
  participant_id: string;
  display_name?: string;
  tmux_session: string | null;
  runtime_id: string | null;
  active_session?: string | null;
  membership_session_id?: string | null;
  membership_state?: AgentSessionMembershipState;
  pane_lifecycle?: AgentPaneLifecycle;
  controllable?: boolean;
  removed_at?: string;
  removed_reason?: AgentRemovedReason;
  runtime_session?: RuntimeSessionInfo | null;
  alive?: boolean;
  activity_state?: AgentActivityState;
  runtime_state?: CurrentRuntimeState;
  access_mode?: string;
}

export interface ManagedTerminal {
  tmux_session: string;
  label: string;
  /* Sequential per-project terminal index (`fmark-…-term-<index>`). Sort the
     inner tabs by this NUMERICALLY — lexicographic order on the session name
     would place `term-10` before `term-2`. */
  index: number;
}

export interface RuntimeEntry {
  displayName: string;
  executable: string;
  args: string[];
  env?: Record<string, string>;
  icon?: string;
  readyDelayMs?: number;
}

export interface RuntimesFile {
  version: string;
  runtimes: Record<string, RuntimeEntry>;
}

export interface SpawnRequest {
  runtime_id: string;
  session_id?: string;
  path_id?: string;
  root?: string;
  name?: string;
  suggested_participant_id?: string;
  model?: string;
  effort?: string;
  access_mode?: string;
}

export interface RuntimeSessionInfo {
  desired_name: string | null;
  native_name_applied: boolean;
  native_session_id?: string | null;
  native_parent_session_id?: string | null;
  native_transcript_path?: string | null;
  native_id_source?:
    | "spawn-storage"
    | "hook"
    | "recovered-storage"
    | "fork-storage"
    | "manual"
    | null;
}

export interface SpawnResponse {
  participant_id: string;
  tmux_session: string;
  runtime_id: string;
  /* Session this agent was bound to at spawn time (the spawn request's
     `session_id`). Null when spawn was called without a session_id. */
  active_session: string | null;
  path_id?: string;
  root?: string;
  mcp_status?: IntegrationStatus | "unknown";
  hooks_status?: IntegrationStatus | "unknown";
  runtime_session?: RuntimeSessionInfo | null;
}

export interface SpawnTerminalRequest {
  name?: string;
}

export interface SpawnTerminalResponse {
  tmux_session: string;
  label: string;
  index: number;
}

export interface KillTerminalRequest {
  tmux_session: string;
}

export interface KillTerminalResponse {
  ok: true;
}

/** Optional root scope carried by per-agent control requests so the kernel
    targets the agent's own project rather than the active path (X2). The
    renderer derives it from the controlled agent's session. */
export interface RootScopeBody {
  path_id?: string;
  root?: string;
}

/** Body for scope-only control routes (pause / resume / reconnect / compact /
    clear): no payload beyond the optional root scope. */
export type ManagedAgentControlRequest = RootScopeBody;

export type ManagedAgentCommandRequest = (
  | { type: "interrupt" }
  | { type: "slash"; command: string }
  | { type: "message"; text: string }
) &
  RootScopeBody;

export interface ManagedAgentCommandResponse {
  ok: true;
}

export interface ManagedAgentConfirmTokenResponse {
  token: string;
}

export interface ManagedAgentGoodbyeResponse {
  ok: true;
}

export interface ManagedAgentLogEntry {
  ts: string;
  event: string;
  [k: string]: unknown;
}

export interface ManagedAgentLogsResponse {
  entries: ManagedAgentLogEntry[];
}

export interface ManagedAgentsListResponse {
  agents: ManagedAgent[];
  terminals: ManagedTerminal[];
}

export type AgentConnectionState =
  | "connected"
  | "detached"
  | "launching"
  | "offline";

export const AGENT_CONNECTION_STATES = {
  connected: "connected",
  detached: "detached",
  launching: "launching",
  offline: "offline",
} as const satisfies Record<string, AgentConnectionState>;

export interface ManagedAgentControlState {
  paused: boolean;
  activity_state: AgentActivityState;
  access_mode: string;
  updated_at?: string;
  last_activity_at?: string;
  last_tmux_activity_at?: string;
  idle_stopped_at?: string | null;
  idle_stop_reason?: "idle-timeout" | null;
  last_tmux_session?: string | null;
  pane_lifecycle?: AgentPaneLifecycle;
}

export type AgentPaneLifecycle =
  | "live"
  | "detached"
  | "idle-stopped"
  | "dead"
  | "no-pane";

export type AgentSessionMembershipState = "active" | "removed";

export type AgentRemovedReason = "goodbye" | "migration" | "user";

export interface AgentSessionMembership {
  participant_id: string;
  session_id: string;
  state: AgentSessionMembershipState;
  runtime_id: string | null;
  joined_at?: string;
  removed_at?: string;
  removed_reason?: AgentRemovedReason;
  last_tmux_session?: string | null;
}

export interface RuntimeForkCapability {
  native_supported: boolean;
  verified: boolean;
  command: string | null;
  command_accepts_name: boolean;
  cli_command: string | null;
  notes: string;
}

export interface RuntimeSubagentCaptureCapability {
  final_result_supported: boolean;
  progressive_supported: boolean;
  verified: boolean;
  sources: string[];
  notes: string;
}

export interface RuntimeControlCapabilities {
  runtime_id: string;
  compact_command: string | null;
  clear_command: string | null;
  fork: RuntimeForkCapability;
  subagents: RuntimeSubagentCaptureCapability;
  reconnect_supported: boolean;
  access_modes: string[];
  default_access_mode: string;
  launch_access_modes: RuntimeAccessModeOption[];
  access_change_supported: boolean;
  access_change_reason?: string;
  context_source:
    | "unsupported"
    | "not-reported"
    | "model-catalog"
    | "claude-status-line"
    | "codex-app-server"
    | "opencode-db";
  context_reason?: string;
}

export interface AgentContextStatus {
  status: "reported" | "not-reported" | "unsupported";
  used_tokens: number | null;
  max_tokens: number | null;
  source: RuntimeControlCapabilities["context_source"];
  reason?: string;
}

export const AGENT_CONTEXT_STATUSES = {
  reported: "reported",
  notReported: "not-reported",
  unsupported: "unsupported",
} as const satisfies Record<string, AgentContextStatus["status"]>;

export interface AgentAccessStatus {
  mode: string;
  supported_modes: string[];
  change_supported: boolean;
  reason?: string;
}

export interface RuntimeAccessModeOption {
  id: string;
  label: string;
  description: string;
  dangerous?: boolean;
  deprecated?: boolean;
}

export const DEFAULT_RUNTIME_ACCESS_MODE = "default";

export const RUNTIME_ACCESS_MODE_OPTIONS: Record<
  string,
  RuntimeAccessModeOption[]
> = {
  claude: [
    {
      id: "default",
      label: "Default",
      description: "Use the runtime's configured permission behavior.",
    },
    {
      id: "acceptEdits",
      label: "Accept edits",
      description: "Start Claude with edit approvals accepted.",
    },
    {
      id: "auto",
      label: "Auto",
      description: "Let Claude automatically approve low-risk actions.",
    },
    {
      id: "dontAsk",
      label: "Do not ask",
      description: "Start Claude in its no-prompt permission mode.",
      dangerous: true,
    },
    {
      id: "plan",
      label: "Plan",
      description: "Start Claude in planning mode.",
    },
    {
      id: "bypassPermissions",
      label: "Bypass permissions",
      description: "Bypass Claude permission checks for this launch.",
      dangerous: true,
    },
  ],
  codex: [
    {
      id: "default",
      label: "Default",
      description: "Use the Codex profile or config approval policy.",
    },
    {
      id: "untrusted",
      label: "Untrusted",
      description: "Ask before commands outside Codex's trusted set.",
    },
    {
      id: "on-request",
      label: "On request",
      description: "Let the agent decide when to ask for approval.",
    },
    {
      id: "never",
      label: "Never ask",
      description: "Return failures to the agent instead of prompting.",
    },
    {
      id: "on-failure",
      label: "On failure",
      description: "Deprecated Codex approval behavior.",
      deprecated: true,
    },
  ],
  opencode: [
    {
      id: "default",
      label: "Default",
      description: "Opencode does not expose a verified launch permission flag.",
    },
    {
      id: "dangerously-skip-permissions",
      label: "Skip permissions",
      description: "Start Opencode with permission prompts auto-approved.",
      dangerous: true,
    },
  ],
};

export function runtimeAccessModeOptions(
  runtimeId: string | null | undefined,
): RuntimeAccessModeOption[] {
  if (runtimeId === null || runtimeId === undefined) return [];
  return RUNTIME_ACCESS_MODE_OPTIONS[runtimeId] ?? [];
}

export function defaultRuntimeAccessMode(
  runtimeId: string | null | undefined,
): string {
  return runtimeAccessModeOptions(runtimeId)[0]?.id ?? DEFAULT_RUNTIME_ACCESS_MODE;
}

export function isRuntimeAccessMode(
  runtimeId: string | null | undefined,
  mode: string,
): boolean {
  return runtimeAccessModeOptions(runtimeId).some((option) => option.id === mode);
}

export function runtimeAccessModeLabel(
  runtimeId: string | null | undefined,
  mode: string,
): string {
  return (
    runtimeAccessModeOptions(runtimeId).find((option) => option.id === mode)
      ?.label ?? mode
  );
}

export interface AgentStatusRow {
  participant_id: string;
  display_name: string;
  runtime_id: string | null;
  active_session: string | null;
  membership_session_id: string | null;
  membership_state: AgentSessionMembershipState;
  pane_lifecycle: AgentPaneLifecycle;
  controllable: boolean;
  removed_at?: string;
  removed_reason?: AgentRemovedReason;
  runtime_session: RuntimeSessionInfo | null;
  managed: boolean;
  paused: boolean;
  connection_state: AgentConnectionState;
  activity_state: AgentActivityState;
  tmux_session: string | null;
  mcp_status: string;
  hook_status: string;
  context: AgentContextStatus;
  access: AgentAccessStatus;
  pending_access_count: number;
  runtime_state?: CurrentRuntimeState;
}

export interface ManagedAgentsStatusResponse {
  agents: AgentStatusRow[];
  removed_agents?: AgentStatusRow[];
  capabilities: Record<string, RuntimeControlCapabilities>;
}

export interface ManagedAgentControlResponse {
  agent: AgentStatusRow;
}

export interface ManagedAgentRenameRequest extends RootScopeBody {
  display_name: string;
}

export interface ManagedAgentAccessPatch extends RootScopeBody {
  mode: string;
}

export interface EnvProbeResult {
  tmux: boolean;
  tmuxVersion: string | null;
  runtimes: Record<string, boolean>;
  installer: string | null;
  os: string;
}

export type HookInstallScope = "local" | "global";

export interface IntegrationPrefs {
  hook_scope?: HookInstallScope;
  model?: string;
  effort?: string;
  access_mode?: string;
  updated_at?: string;
}

export interface HookInstallQuery {
  runtime_id: string;
  participant_id?: string;
  user_participant_id?: string;
}

export interface HookInstallStatus {
  installed: boolean;
  status?: "installed" | "missing" | "stale" | "blocked";
  configPath: string;
  expectedVersion?: string;
  detectedVersion?: string | null;
  detectedEntries: { event: string; command: string; version?: string | null }[];
  expectedEntries: { event: string; command: string; version?: string | null }[];
  locations?: HookInstallLocationStatus[];
}

export interface HookInstallInstructions {
  markdown: string;
  manualSteps: { configPath: string; snippet: string }[];
  promptSteps?: { label: string; text: string }[];
}

export interface HookInstallLocationStatus {
  scope: HookInstallScope;
  configPath: string;
  exists: boolean;
  installed: boolean;
  status?: "installed" | "missing" | "stale" | "blocked";
  expectedVersion?: string;
  detectedVersion?: string | null;
  detectedEntries: { event: string; command: string; version?: string | null }[];
  expectedEntries: { event: string; command: string; version?: string | null }[];
  error?: string;
}

export interface HookInstallApplyResponse {
  applied: boolean;
  scope: HookInstallScope;
  configPath: string;
  status: HookInstallStatus;
}

export interface PresenceMessage {
  type: "presence";
  participant_id: string;
  state: PresenceState;
  last_hook_at: number | null;
}

export interface ManagedAgentSpawnedMessage {
  type: "managed-agent.spawned";
  participant_id: string;
  tmux_session: string;
  runtime_id: string;
  /* Session the spawned agent is bound to. Null when spawn was called
     without a session_id. Renderer uses this to upsert the participant's
     active_session in the store on cross-tab spawn broadcasts. */
  active_session: string | null;
}

export interface ManagedAgentKilledMessage {
  type: "managed-agent.killed";
  participant_id: string;
}

export interface ManagedAgentUpdatedMessage {
  type: "managed-agent.updated";
  agent: AgentStatusRow;
}

export interface ManagedAgentTerminalSpawnedMessage {
  type: "managed-agent.terminal-spawned";
  tmux_session: string;
  label: string;
  index: number;
}

export interface ManagedAgentTerminalClosedMessage {
  type: "managed-agent.terminal-closed";
  tmux_session: string;
}

export interface EnvProbeUpdatedMessage {
  type: "env-probe.updated";
  result: EnvProbeResult;
}

export type ManagedAgentWsMessage =
  | PresenceMessage
  | ManagedAgentSpawnedMessage
  | ManagedAgentKilledMessage
  | ManagedAgentUpdatedMessage
  | ManagedAgentTerminalSpawnedMessage
  | ManagedAgentTerminalClosedMessage
  | EnvProbeUpdatedMessage;
