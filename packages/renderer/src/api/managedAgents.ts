import type {
  EnvProbeResult,
  HookInstallApplyResponse,
  HookInstallInstructions,
  HookInstallStatus,
  ManagedAgentsListResponse,
  RuntimesFile,
  SpawnRequest,
  SpawnResponse,
  RuntimeEntry,
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
  spawnTerminal(name?: string): Promise<{ tmux_session: string; label: string }>;
  getConfirmToken(participantId: string): Promise<string>;
  goodbye(participantId: string, confirmToken: string): Promise<void>;
  command(
    participantId: string,
    body:
      | { type: "interrupt" }
      | { type: "slash"; command: string }
      | { type: "message"; text: string },
  ): Promise<void>;
  envProbe(): Promise<EnvProbeResult>;
  refreshEnvProbe(): Promise<EnvProbeResult>;
  hookInstallStatus(opts: {
    runtime_id: string;
    participant_id?: string;
    user_participant_id?: string;
  }): Promise<HookInstallStatus>;
  hookInstallInstructions(opts: {
    runtime_id: string;
    participant_id?: string;
    user_participant_id?: string;
  }): Promise<HookInstallInstructions>;
  hookInstallApply(opts: {
    runtime_id: string;
    participant_id?: string;
    user_participant_id?: string;
    scope: "local" | "global";
  }): Promise<HookInstallApplyResponse>;
  logs(
    participantId: string,
    limit?: number,
  ): Promise<{
    entries: { ts: string; event: string; [k: string]: unknown }[];
  }>;
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
      throw new Error(`${method} ${path} → ${res.status}: ${text}`);
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
    spawnTerminal: (name) =>
      req<{ tmux_session: string; label: string }>(
        "POST",
        "/managed-agents/terminal",
        { name },
      ),
    getConfirmToken: async (id) => {
      const r = await req<{ token: string }>(
        "GET",
        `/managed-agents/${encodeURIComponent(id)}/confirm-token`,
      );
      return r.token;
    },
    goodbye: (id, confirmToken) =>
      req<void>(
        "DELETE",
        `/managed-agents/${encodeURIComponent(id)}?confirm=${encodeURIComponent(confirmToken)}`,
      ),
    command: (id, body) =>
      req<void>(
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
      return req<{
        entries: { ts: string; event: string; [k: string]: unknown }[];
      }>("GET", `/managed-agents/${encodeURIComponent(id)}/logs${q}`);
    },
    listRuntimes: () => req<RuntimesFile>("GET", "/runtimes"),
    upsertRuntime: (id, entry) =>
      req<RuntimesFile>("PUT", `/runtimes/${encodeURIComponent(id)}`, entry),
    removeRuntime: (id) =>
      req<RuntimesFile>("DELETE", `/runtimes/${encodeURIComponent(id)}`),
  };
}
