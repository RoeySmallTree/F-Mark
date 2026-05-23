import type {
  EnvProbeResult,
  HookInstallInstructions,
  HookInstallStatus,
  ManagedAgentsListResponse,
  SpawnRequest,
  SpawnResponse,
} from "@f-mark/shared";

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
    participant_id: string;
    user_participant_id?: string;
  }): Promise<HookInstallStatus>;
  hookInstallInstructions(opts: {
    runtime_id: string;
    participant_id: string;
    user_participant_id: string;
  }): Promise<HookInstallInstructions>;
  logs(
    participantId: string,
    limit?: number,
  ): Promise<{
    entries: { ts: string; event: string; [k: string]: unknown }[];
  }>;
}

export interface ManagedAgentsClientConfig {
  baseUrl: string;
  token: string | null;
}

export function createManagedAgentsClient(
  deps: ManagedAgentsClientConfig,
): ManagedAgentsClient {
  const { baseUrl, token } = deps;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token !== null) headers.Authorization = `Bearer ${token}`;

  async function req<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${method} ${path} → ${res.status}: ${text}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
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
      q.set("participant_id", opts.participant_id);
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
      q.set("participant_id", opts.participant_id);
      q.set("user_participant_id", opts.user_participant_id);
      return req<HookInstallInstructions>(
        "POST",
        `/managed-agents/hook-install-instructions?${q.toString()}`,
      );
    },
    logs: (id, limit) => {
      const q = limit !== undefined ? `?since=${limit}` : "";
      return req<{
        entries: { ts: string; event: string; [k: string]: unknown }[];
      }>("GET", `/managed-agents/${encodeURIComponent(id)}/logs${q}`);
    },
  };
}
