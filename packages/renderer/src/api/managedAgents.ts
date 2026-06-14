import type {
  EnvProbeResult,
  EffortDescriptor,
  HookInstallApplyResponse,
  HookInstallQuery,
  HookInstallInstructions,
  HookInstallScope,
  HookInstallStatus,
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
  SpawnTerminalResponse,
  SpawnRequest,
  SpawnResponse,
  RuntimeEntry,
  RuntimeOverridePatch,
  WakeSessionRequest,
  WakeSessionResponse,
} from "@f-mark/shared";

export const PROCESS_API_DISABLED_MESSAGE =
  "Managed-agent spawning is disabled. Restart F-Mark with --allow-process-api-no-auth when running --no-auth, or run with auth enabled.";

export function isProcessApiDisabledError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("process-spawning API disabled") ||
    message.includes("--allow-process-api-no-auth")
  );
}

export interface ManagedAgentsClient {
  list(): Promise<ManagedAgentsListResponse>;
  spawn(req: SpawnRequest): Promise<SpawnResponse>;
  preflight(req: IntegrationPreflightRequest): Promise<IntegrationPreflightResponse>;
  integrationApply(req: IntegrationApplyRequest): Promise<IntegrationApplyResponse>;
  status(sessionId?: string): Promise<ManagedAgentsStatusResponse>;
  pause(participantId: string): Promise<ManagedAgentControlResponse>;
  resume(participantId: string): Promise<ManagedAgentControlResponse>;
  rename(
    participantId: string,
    body: ManagedAgentRenameRequest,
  ): Promise<ManagedAgentControlResponse>;
  reconnect(participantId: string): Promise<ManagedAgentControlResponse>;
  compact(participantId: string): Promise<ManagedAgentControlResponse>;
  clear(participantId: string): Promise<ManagedAgentControlResponse>;
  context(participantId: string): Promise<ManagedAgentControlResponse["agent"]["context"]>;
  access(participantId: string): Promise<ManagedAgentControlResponse["agent"]["access"]>;
  runtimeModels(
    participantId: string,
    opts?: { refresh?: boolean },
  ): Promise<ModelDescriptor[]>;
  runtimeEfforts(
    participantId: string,
    model?: string,
  ): Promise<EffortDescriptor[]>;
  setRuntime(
    participantId: string,
    body: RuntimeOverridePatch & { restart?: boolean },
  ): Promise<{ ok: true; state: ManagedAgentControlResponse["agent"]["runtime_state"] }>;
  setAccess(
    participantId: string,
    body: ManagedAgentAccessPatch,
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
  getConfirmToken(participantId: string): Promise<string>;
  goodbye(
    participantId: string,
    confirmToken: string,
  ): Promise<ManagedAgentGoodbyeResponse>;
  command(
    participantId: string,
    body: ManagedAgentCommandRequest,
  ): Promise<ManagedAgentCommandResponse>;
  envProbe(): Promise<EnvProbeResult>;
  refreshEnvProbe(): Promise<EnvProbeResult>;
  hookInstallStatus(opts: HookInstallQuery): Promise<HookInstallStatus>;
  hookInstallInstructions(opts: HookInstallQuery): Promise<HookInstallInstructions>;
  hookInstallApply(
    opts: HookInstallQuery & { scope: HookInstallScope },
  ): Promise<HookInstallApplyResponse>;
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

export class ManagedAgentsApiError extends Error {
  method: string;
  path: string;
  status: number;
  body: string;
  backendError?: string;

  constructor(input: {
    method: string;
    path: string;
    status: number;
    body: string;
    backendError?: string;
  }) {
    super(
      input.backendError !== undefined
        ? `${input.method} ${input.path} → ${input.status}: ${input.backendError}`
        : `${input.method} ${input.path} → ${input.status}`,
    );
    this.name = "ManagedAgentsApiError";
    this.method = input.method;
    this.path = input.path;
    this.status = input.status;
    this.body = input.body;
    this.backendError = input.backendError;
  }
}

export function createManagedAgentsClient(
  deps: ManagedAgentsClientConfig,
): ManagedAgentsClient {
  const { baseUrl, token } = deps;
  // Only set Content-Type when there IS a body — Fastify rejects a POST that
  // declares `application/json` but ships an empty body with
  // FST_ERR_CTP_EMPTY_JSON_BODY. Authorization stays regardless.
  const authHeader: Record<string, string> =
    token !== null ? { Authorization: `Bearer ${token}` } : {};

  function localKernelFallbackBase(): string | null {
    if (baseUrl !== "" || typeof window === "undefined") return null;
    const { protocol, hostname, port } = window.location;
    if (protocol !== "http:" && protocol !== "https:") return null;
    if (
      hostname !== "localhost" &&
      hostname !== "127.0.0.1" &&
      hostname !== "::1"
    ) {
      return null;
    }
    if (port === "" || port === "7777") return null;
    const host = hostname === "::1" ? "[::1]" : hostname;
    return `${protocol}//${host}:7777`;
  }

  function isHtmlResponse(res: Response, text: string): boolean {
    const contentType = res.headers.get("Content-Type") ?? "";
    return (
      contentType.includes("text/html") ||
      /^<!doctype html/i.test(text.trim())
    );
  }

  async function fetchText(
    method: string,
    path: string,
    body: unknown,
    requestBaseUrl: string,
  ): Promise<{ res: Response; text: string }> {
    const init: RequestInit = { method, headers: { ...authHeader } };
    if (body !== undefined) {
      (init.headers as Record<string, string>)["Content-Type"] =
        "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${requestBaseUrl}${path}`, init);
    const text = res.status === 204 ? "" : await res.text();
    return { res, text };
  }

  async function req<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let { res, text } = await fetchText(method, path, body, baseUrl);
    if (isHtmlResponse(res, text)) {
      const fallbackBase = localKernelFallbackBase();
      if (fallbackBase !== null) {
        try {
          const fallback = await fetchText(method, path, body, fallbackBase);
          res = fallback.res;
          text = fallback.text;
        } catch {
          // Keep the clearer HTML/proxy error below.
        }
      }
    }
    if (!res.ok) {
      let backendError: string | undefined;
      try {
        const parsed = JSON.parse(text) as unknown;
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "error" in parsed &&
          typeof parsed.error === "string"
        ) {
          backendError = parsed.error;
        }
      } catch {
        backendError = text.trim().length > 0 ? text : undefined;
      }
      throw new ManagedAgentsApiError({
        method,
        path,
        status: res.status,
        body: text,
        backendError,
      });
    }
    if (res.status === 204) return undefined as unknown as T;
    if (text.length === 0) return undefined as unknown as T;
    if (isHtmlResponse(res, text)) {
      throw new Error(
        `${method} ${path} returned HTML instead of JSON. The request may be hitting the renderer instead of the kernel API.`,
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new Error(
        `${method} ${path} → ${res.status} returned non-JSON: ${text.slice(0, 200)}`,
      );
    }
  }

  return {
    list: () => req<ManagedAgentsListResponse>("GET", "/managed-agents"),
    spawn: (r) => req<SpawnResponse>("POST", "/managed-agents/spawn", r),
    preflight: (r) =>
      req<IntegrationPreflightResponse>("POST", "/managed-agents/preflight", r),
    integrationApply: (r) =>
      req<IntegrationApplyResponse>(
        "POST",
        "/managed-agents/integration-apply",
        r,
      ),
    status: (sessionId) => {
      const q =
        sessionId !== undefined
          ? `?session_id=${encodeURIComponent(sessionId)}`
          : "";
      return req<ManagedAgentsStatusResponse>(
        "GET",
        `/managed-agents/status${q}`,
      );
    },
    pause: (id) =>
      req<ManagedAgentControlResponse>(
        "POST",
        `/managed-agents/${encodeURIComponent(id)}/pause`,
      ),
    resume: (id) =>
      req<ManagedAgentControlResponse>(
        "POST",
        `/managed-agents/${encodeURIComponent(id)}/resume`,
      ),
    rename: (id, body) =>
      req<ManagedAgentControlResponse>(
        "PATCH",
        `/managed-agents/${encodeURIComponent(id)}`,
        body,
      ),
    reconnect: (id) =>
      req<ManagedAgentControlResponse>(
        "POST",
        `/managed-agents/${encodeURIComponent(id)}/reconnect`,
      ),
    compact: (id) =>
      req<ManagedAgentControlResponse>(
        "POST",
        `/managed-agents/${encodeURIComponent(id)}/compact`,
      ),
    clear: (id) =>
      req<ManagedAgentControlResponse>(
        "POST",
        `/managed-agents/${encodeURIComponent(id)}/clear`,
      ),
    context: (id) =>
      req<ManagedAgentControlResponse["agent"]["context"]>(
        "GET",
        `/managed-agents/${encodeURIComponent(id)}/context`,
      ),
    access: (id) =>
      req<ManagedAgentControlResponse["agent"]["access"]>(
        "GET",
        `/managed-agents/${encodeURIComponent(id)}/access`,
      ),
    runtimeModels: (id, opts) => {
      const q = opts?.refresh === true ? "?refresh=true" : "";
      return req<{ models: ModelDescriptor[] }>(
        "GET",
        `/managed-agents/${encodeURIComponent(id)}/runtime/models${q}`,
      ).then((r) => r.models);
    },
    runtimeEfforts: (id, model) => {
      const q =
        model !== undefined && model.length > 0
          ? `?model=${encodeURIComponent(model)}`
          : "";
      return req<{ efforts: EffortDescriptor[] }>(
        "GET",
        `/managed-agents/${encodeURIComponent(id)}/runtime/efforts${q}`,
      ).then((r) => r.efforts);
    },
    setRuntime: (id, body) =>
      req<{ ok: true; state: ManagedAgentControlResponse["agent"]["runtime_state"] }>(
        "PUT",
        `/managed-agents/${encodeURIComponent(id)}/runtime`,
        body,
      ),
    setAccess: (id, body) =>
      req<ManagedAgentControlResponse>(
        "PATCH",
        `/managed-agents/${encodeURIComponent(id)}/access`,
        body,
      ),
    respondAccessRequest: (id, requestId, body) =>
      req<ManagedAccessResponseResponse>(
        "POST",
        `/managed-agents/${encodeURIComponent(id)}/access-requests/${encodeURIComponent(requestId)}/respond`,
        body,
      ),
    wakeSession: (sessionId, body) =>
      req<WakeSessionResponse>(
        "POST",
        `/sessions/${encodeURIComponent(sessionId)}/wake`,
        body,
      ),
    spawnTerminal: (name) =>
      req<SpawnTerminalResponse>(
        "POST",
        "/managed-agents/terminal",
        { name },
      ),
    getConfirmToken: async (id) => {
      const r = await req<ManagedAgentConfirmTokenResponse>(
        "GET",
        `/managed-agents/${encodeURIComponent(id)}/confirm-token`,
      );
      return r.token;
    },
    goodbye: (id, confirmToken) =>
      req<ManagedAgentGoodbyeResponse>(
        "DELETE",
        `/managed-agents/${encodeURIComponent(id)}?confirm=${encodeURIComponent(confirmToken)}`,
      ),
    command: (id, body) =>
      req<ManagedAgentCommandResponse>(
        "POST",
        `/managed-agents/${encodeURIComponent(id)}/command`,
        body,
      ),
    envProbe: () => req<EnvProbeResult>("GET", "/env-probe"),
    refreshEnvProbe: () => req<EnvProbeResult>("POST", "/env-probe/refresh"),
    hookInstallStatus: (opts) => {
      const q = new URLSearchParams();
      q.set("runtime_id", opts.runtime_id);
      if (opts.participant_id !== undefined) {
        q.set("participant_id", opts.participant_id);
      }
      if (opts.user_participant_id !== undefined) {
        q.set("user_participant_id", opts.user_participant_id);
      }
      return req<HookInstallStatus>(
        "GET",
        `/managed-agents/hook-install-status?${q.toString()}`,
      );
    },
    hookInstallInstructions: (opts) => {
      const q = new URLSearchParams();
      q.set("runtime_id", opts.runtime_id);
      if (opts.participant_id !== undefined) {
        q.set("participant_id", opts.participant_id);
      }
      if (opts.user_participant_id !== undefined) {
        q.set("user_participant_id", opts.user_participant_id);
      }
      return req<HookInstallInstructions>(
        "POST",
        `/managed-agents/hook-install-instructions?${q.toString()}`,
      );
    },
    hookInstallApply: (opts) => {
      const q = new URLSearchParams();
      q.set("runtime_id", opts.runtime_id);
      if (opts.participant_id !== undefined) {
        q.set("participant_id", opts.participant_id);
      }
      if (opts.user_participant_id !== undefined) {
        q.set("user_participant_id", opts.user_participant_id);
      }
      return req<HookInstallApplyResponse>(
        "POST",
        `/managed-agents/hook-install-apply?${q.toString()}`,
        { scope: opts.scope },
      );
    },
    logs: (id, limit) => {
      const q = limit !== undefined ? `?since=${limit}` : "";
      return req<ManagedAgentLogsResponse>(
        "GET",
        `/managed-agents/${encodeURIComponent(id)}/logs${q}`,
      );
    },
    listRuntimes: () => req<RuntimesFile>("GET", "/runtimes"),
    upsertRuntime: (id, entry) =>
      req<RuntimesFile>("PUT", `/runtimes/${encodeURIComponent(id)}`, entry),
    removeRuntime: (id) =>
      req<RuntimesFile>("DELETE", `/runtimes/${encodeURIComponent(id)}`),
  };
}
