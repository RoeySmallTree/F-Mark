import type { IntegrationStatus } from "./integrations.js";
import type { CurrentRuntimeState } from "./runtimeAdapters.js";

export type PresenceState =
  | "launching"
  | "online"
  | "stale"
  | "offline"
  | "pane-dead"
  | "hook-not-installed";

export interface ManagedAgent {
  participant_id: string;
  tmux_session: string | null;
  runtime_id: string | null;
  runtime_session?: RuntimeSessionInfo | null;
  alive?: boolean;
  runtime_state?: CurrentRuntimeState;
}

export interface ManagedTerminal {
  tmux_session: string;
  label: string;
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
  name?: string;
  suggested_participant_id?: string;
}

export interface RuntimeSessionInfo {
  desired_name: string | null;
  native_name_applied: boolean;
}

export interface SpawnResponse {
  participant_id: string;
  tmux_session: string;
  runtime_id: string;
  /* Session this agent was bound to at spawn time (the spawn request's
     `session_id`). Null when spawn was called without a session_id. */
  active_session: string | null;
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

export type ManagedAgentCommandRequest =
  | { type: "interrupt" }
  | { type: "slash"; command: string }
  | { type: "message"; text: string };

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

export type AgentActivityState =
  | "idle"
  | "running"
  | "notified"
  | "turn-ended"
  | "access-pending";

export type AgentConnectionState =
  | "connected"
  | "detached"
  | "launching"
  | "offline";

export interface ManagedAgentControlState {
  paused: boolean;
  activity_state: AgentActivityState;
  access_mode: string;
  updated_at?: string;
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
  access_change_supported: boolean;
  context_source: "unknown" | "claude-status-line";
}

export interface AgentContextStatus {
  status: "unknown";
  used_tokens: number | null;
  max_tokens: number | null;
  source: "unknown" | "unsupported";
}

export interface AgentAccessStatus {
  mode: string;
  supported_modes: string[];
  change_supported: boolean;
  reason?: string;
}

export interface AgentStatusRow {
  participant_id: string;
  display_name: string;
  runtime_id: string | null;
  active_session: string | null;
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
  capabilities: Record<string, RuntimeControlCapabilities>;
}

export interface ManagedAgentControlResponse {
  agent: AgentStatusRow;
}

export interface ManagedAgentRenameRequest {
  display_name: string;
}

export interface ManagedAgentAccessPatch {
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
  | EnvProbeUpdatedMessage;
