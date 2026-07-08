import type {
  EnvProbeResult,
  EffortDescriptor,
  IntegrationApplyRequest,
  IntegrationApplyResponse,
  IntegrationPreflightRequest,
  IntegrationPreflightResponse,
  ManagedAgentCommandRequest,
  ManagedAgentCommandResponse,
  ManagedAgentConfirmTokenResponse,
  ManagedAgentControlResponse,
  ManagedAgentGoodbyeResponse,
  ManagedAgentLogsResponse,
  ManagedAccessResponseRequest,
  ManagedAccessResponseResponse,
  ManagedAgentAccessPatch,
  ManagedAgentRenameRequest,
  ManagedAgentsListResponse,
  ManagedAgentsStatusResponse,
  ModelDescriptor,
  RuntimesFile,
  KillTerminalResponse,
  SpawnTerminalResponse,
  SpawnRequest,
  SpawnResponse,
  RuntimeEntry,
  RuntimeOverridePatch,
  WakeSessionRequest,
  WakeSessionResponse,
} from "@f-mark/shared";
import { createManagedAgentControlMethods } from "./managedAgents/controlMethods.js";
import { createManagedAgentLifecycleMethods } from "./managedAgents/lifecycleMethods.js";
import { createManagedAgentsRequest } from "./managedAgents/request.js";
import { createManagedAgentRuntimeMethods } from "./managedAgents/runtimeMethods.js";
import type { RootScope } from "./rootScope.js";

const NO_LOOSE_STRING_VALUES = {
  allowProcessApiNoAuth: "--allow-process-api-no-auth",
} as const;

export { ManagedAgentsApiError } from "./managedAgents/request.js";

export const PROCESS_API_DISABLED_MESSAGE =
  "Managed-agent spawning is disabled. Restart F-Mark with --allow-process-api-no-auth when running --no-auth, or run with auth enabled.";

export function isProcessApiDisabledError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("process-spawning API disabled") ||
    message.includes(NO_LOOSE_STRING_VALUES.allowProcessApiNoAuth)
  );
}

export interface RuntimeCatalogModelsResponse {
  models: ModelDescriptor[];
  default_model?: string;
  default_effort?: string;
  default_access_mode?: string;
}

export interface ManagedAgentsClient {
  list(): Promise<ManagedAgentsListResponse>;
  spawn(req: SpawnRequest): Promise<SpawnResponse>;
  preflight(req: IntegrationPreflightRequest): Promise<IntegrationPreflightResponse>;
  integrationApply(req: IntegrationApplyRequest): Promise<IntegrationApplyResponse>;
  status(
    sessionId?: string,
    scope?: RootScope | null,
  ): Promise<ManagedAgentsStatusResponse>;
  pause(
    participantId: string,
    scope?: RootScope | null,
  ): Promise<ManagedAgentControlResponse>;
  resume(
    participantId: string,
    scope?: RootScope | null,
  ): Promise<ManagedAgentControlResponse>;
  rename(
    participantId: string,
    body: ManagedAgentRenameRequest,
    scope?: RootScope | null,
  ): Promise<ManagedAgentControlResponse>;
  reconnect(
    participantId: string,
    scope?: RootScope | null,
  ): Promise<ManagedAgentControlResponse>;
  compact(
    participantId: string,
    scope?: RootScope | null,
  ): Promise<ManagedAgentControlResponse>;
  clear(
    participantId: string,
    scope?: RootScope | null,
  ): Promise<ManagedAgentControlResponse>;
  context(participantId: string): Promise<ManagedAgentControlResponse["agent"]["context"]>;
  access(participantId: string): Promise<ManagedAgentControlResponse["agent"]["access"]>;
  runtimeModels(
    participantId: string,
    opts?: { refresh?: boolean; scope?: RootScope | null },
  ): Promise<ModelDescriptor[]>;
  runtimeEfforts(
    participantId: string,
    model?: string,
    scope?: RootScope | null,
  ): Promise<EffortDescriptor[]>;
  runtimeCatalogModels(
    runtimeId: string,
    opts?: { refresh?: boolean },
  ): Promise<RuntimeCatalogModelsResponse>;
  runtimeCatalogEfforts(
    runtimeId: string,
    model?: string,
  ): Promise<EffortDescriptor[]>;
  setRuntime(
    participantId: string,
    body: RuntimeOverridePatch & { restart?: boolean },
    scope?: RootScope | null,
  ): Promise<{ ok: true; state: ManagedAgentControlResponse["agent"]["runtime_state"] }>;
  setAccess(
    participantId: string,
    body: ManagedAgentAccessPatch,
    scope?: RootScope | null,
  ): Promise<ManagedAgentControlResponse>;
  respondAccessRequest(
    participantId: string,
    requestId: string,
    body: ManagedAccessResponseRequest,
  ): Promise<ManagedAccessResponseResponse>;
  wakeSession(
    sessionId: string,
    req?: WakeSessionRequest,
  ): Promise<WakeSessionResponse>;
  spawnTerminal(name?: string): Promise<SpawnTerminalResponse>;
  killTerminal(tmuxSession: string): Promise<KillTerminalResponse>;
  getConfirmToken(participantId: string): Promise<string>;
  goodbye(
    participantId: string,
    confirmToken: string,
    scope?: RootScope | null,
  ): Promise<ManagedAgentGoodbyeResponse>;
  command(
    participantId: string,
    body: ManagedAgentCommandRequest,
    scope?: RootScope | null,
  ): Promise<ManagedAgentCommandResponse>;
  envProbe(): Promise<EnvProbeResult>;
  refreshEnvProbe(): Promise<EnvProbeResult>;
  logs(
    participantId: string,
    limit?: number,
  ): Promise<ManagedAgentLogsResponse>;
  listRuntimes(): Promise<RuntimesFile>;
  upsertRuntime(id: string, entry: RuntimeEntry): Promise<RuntimesFile>;
  removeRuntime(id: string): Promise<RuntimesFile>;
}

export interface ManagedAgentsClientConfig {
  baseUrl: string;
  token: string | null;
}

export function createManagedAgentsClient(
  deps: ManagedAgentsClientConfig,
): ManagedAgentsClient {
  const req = createManagedAgentsRequest(deps);
  return {
    ...createManagedAgentLifecycleMethods(req),
    ...createManagedAgentControlMethods(req),
    ...createManagedAgentRuntimeMethods(req),
  };
}
