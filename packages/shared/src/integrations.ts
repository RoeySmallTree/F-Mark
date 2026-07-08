export type RuntimeId = "claude" | "codex" | "opencode" | string;

export const RUNTIME_IDS = {
  claude: "claude",
  codex: "codex",
  opencode: "opencode",
} as const satisfies Record<string, RuntimeId>;

export const RETIRED_RUNTIME_IDS = ["gemini"] as const;

const RETIRED_RUNTIME_ID_SET = new Set<string>(RETIRED_RUNTIME_IDS);

export function isOfferableRuntimeId(runtimeId: string): boolean {
  return !RETIRED_RUNTIME_ID_SET.has(runtimeId);
}

export function filterOfferableRuntimeEntries<T>(
  runtimes: Record<string, T>,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, entry] of Object.entries(runtimes)) {
    if (isOfferableRuntimeId(id)) out[id] = entry;
  }
  return out;
}

export type IntegrationScope = "project" | "user" | "local";

export type IntegrationStatus =
  | "installed"
  | "missing"
  | "stale"
  | "blocked"
  | "unsupported"
  | "not_required";

export const INTEGRATION_STATUSES = {
  installed: "installed",
  missing: "missing",
  stale: "stale",
  blocked: "blocked",
  unsupported: "unsupported",
  notRequired: "not_required",
} as const satisfies Record<string, IntegrationStatus>;

export interface IntegrationLocation {
  scope: IntegrationScope;
  path: string;
  status: IntegrationStatus;
  version?: string;
  reason?: string;
  safe_auto_apply: boolean;
}

export interface IntegrationCheck {
  status: IntegrationStatus;
  expected_version?: string;
  locations: IntegrationLocation[];
}

export interface RuntimeCapability {
  runtime_id: RuntimeId;
  executable: string;
  version?: string;
  available: boolean;
  reason?: string;
}

export interface IntegrationPreflightRequest {
  runtime_id: RuntimeId;
  participant_id?: string;
  path_id?: string;
  root?: string;
}

export interface IntegrationPreflightResponse {
  runtime: RuntimeCapability;
  mcp: IntegrationCheck;
  hooks: IntegrationCheck;
  chosen_scope: IntegrationScope;
  can_apply: boolean;
}

export interface IntegrationApplyRequest {
  runtime_id: RuntimeId;
  scope?: IntegrationScope;
  participant_id?: string;
  path_id?: string;
  root?: string;
}

export interface IntegrationApplyResponse extends IntegrationPreflightResponse {
  applied: {
    mcp?: IntegrationLocation;
    hooks?: IntegrationLocation;
  };
  changed: boolean;
  mcp_changed?: boolean;
  hooks_changed?: boolean;
  cleanup?: {
    killed_mcp_pids: number[];
    killed_agents: string[];
    closed_http_sessions: number;
    errors: string[];
  };
}

export type McpInstallStatus = IntegrationStatus;
export type HookInstallStatusV2 = IntegrationStatus;
