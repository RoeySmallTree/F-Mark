export type RuntimeId = "claude" | "codex" | "gemini" | "opencode" | string;

export type IntegrationScope = "project" | "user" | "local";

export type IntegrationStatus =
  | "installed"
  | "missing"
  | "stale"
  | "blocked"
  | "unsupported"
  | "not_required";

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
}

export interface IntegrationPreflightResponse {
  runtime: RuntimeCapability;
  mcp: IntegrationCheck;
  hooks: IntegrationCheck;
  can_apply: boolean;
}

export interface IntegrationApplyRequest {
  runtime_id: RuntimeId;
  scope?: IntegrationScope;
  participant_id?: string;
}

export interface IntegrationApplyResponse extends IntegrationPreflightResponse {
  applied: {
    mcp?: IntegrationLocation;
    hooks?: IntegrationLocation;
  };
  changed: boolean;
}

export type McpInstallStatus = IntegrationStatus;
export type HookInstallStatusV2 = IntegrationStatus;
