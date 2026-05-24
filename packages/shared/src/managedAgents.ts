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
  alive?: boolean;
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

export interface SpawnResponse {
  participant_id: string;
  tmux_session: string;
  runtime_id: string;
  /* Session this agent was bound to at spawn time (the spawn request's
     `session_id`). Null when spawn was called without a session_id. */
  active_session: string | null;
  hooks_status?: "installed" | "missing" | "not_required" | "unknown";
}

export interface ManagedAgentsListResponse {
  agents: ManagedAgent[];
  terminals: ManagedTerminal[];
}

export interface EnvProbeResult {
  tmux: boolean;
  tmuxVersion: string | null;
  runtimes: Record<string, boolean>;
  installer: string | null;
  os: string;
}

export interface HookInstallStatus {
  installed: boolean;
  configPath: string;
  detectedEntries: { event: string; command: string }[];
  expectedEntries: { event: string; command: string }[];
}

export interface HookInstallInstructions {
  markdown: string;
  manualSteps: { configPath: string; snippet: string }[];
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
  | ManagedAgentTerminalSpawnedMessage
  | EnvProbeUpdatedMessage;
