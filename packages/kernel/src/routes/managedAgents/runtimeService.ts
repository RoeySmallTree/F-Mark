import type {
  CurrentRuntimeState,
  EffortDescriptor,
  ModelDescriptor,
  RuntimeOverridePatch,
  RuntimeStateSource,
} from "@f-mark/shared";
import { getAdapter } from "../../runtimes/adapters/index.js";
import {
  RuntimeModelValidationError,
  validateRuntimeModelPatch,
} from "../../runtimes/modelValidation.js";
import {
  getRuntimeState,
  setRuntimeState,
} from "../../services/runtimeState.js";
import { listParticipants, setParticipantOverrides } from "../../participants.js";
import { computePathId } from "../../paths/identity.js";
import type { PathContextRef } from "../../paths/contextRef.js";
import type { Paths } from "../../paths.js";
import type { PresenceTracker } from "../../presence/tracker.js";
import { loadRuntimeRegistry } from "../../runtimes/store.js";
import type { AgentStateStore } from "../../services/agentState.js";
import type { TmuxManager } from "../../tmux/manager.js";
import {
  buildLaunchPrompt,
  materializeLaunchPacket,
  readLaunchRecentEvents,
} from "./launchService.js";
import type { ManagedAgentRootBinding } from "./types.js";
import { normalizeAccessMode } from "./runtimeAccess.js";
import { spawnArgsForRuntime } from "./runtimeArgs.js";
import { readSessionSlug } from "../../sessions.js";

type ErrorBody = { error: string };

type ErrorResult = {
  status: number;
  body: ErrorBody;
};

type RouteResult<T> = { status: number; body: T } | ErrorResult;

interface ManagedAgentRuntimeServiceDeps {
  fallbackPaths: Paths;
  pathContextRef?: PathContextRef;
  tmux: TmuxManager;
  tracker: PresenceTracker;
  routePaths(): Paths;
  agentState(): AgentStateStore;
  firstUserParticipantId(p: Paths): Promise<string | undefined>;
  ensureLaunchProjectConnection(p: Paths): Promise<void>;
  publishAgentUpdated(
    participantId: string,
    binding?: ManagedAgentRootBinding | null,
  ): Promise<void>;
  scheduleCodexLiveTextPolling(input: {
    participantId: string;
    sessionId: string | null | undefined;
    runtimeId: string | null | undefined;
    binding?: ManagedAgentRootBinding | null;
    reset?: boolean;
  }): void;
  paneAlive(sessionName: string): boolean;
}

export class ManagedAgentRuntimeService {
  constructor(private readonly deps: ManagedAgentRuntimeServiceDeps) {}

  async recordRuntimeState(input: {
    participantId: string;
    body: unknown;
    binding: ManagedAgentRootBinding;
  }): Promise<RouteResult<{ ok: true; state: CurrentRuntimeState }>> {
    const body = input.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return { status: 400, body: { error: "missing body" } };
    }

    const p = input.binding.paths;
    const stateStore = input.binding.state;
    const participants = await listParticipants(p, { agentState: stateStore });
    const persisted = participants[input.participantId];

    let observed: Partial<CurrentRuntimeState> = {};
    const triggerSessionId =
      typeof body.runtime_session_id === "string"
        ? body.runtime_session_id
        : undefined;
    if (triggerSessionId !== undefined && triggerSessionId.length > 0) {
      await stateStore.mergeRuntimeSession(input.participantId, {
        native_session_id: triggerSessionId,
        native_id_source: "hook",
      });
    }
    if (triggerSessionId && typeof body.model !== "string") {
      const adapter = getAdapter(persisted?.runtime_id ?? null);
      if (adapter) {
        try {
          const probed = await adapter.readCurrent({
            sessionId: triggerSessionId,
          });
          if (probed) observed = probed;
        } catch {
          // best-effort
        }
      }
    } else {
      observed = {
        model: typeof body.model === "string" ? body.model : undefined,
        effort: typeof body.effort === "string" ? body.effort : undefined,
        provider: typeof body.provider === "string" ? body.provider : undefined,
        contextUsedTokens:
          numberField(body.contextUsedTokens) ??
          numberField(body.context_used_tokens) ??
          numberField(body.used_tokens),
        contextWindowTokens:
          numberField(body.contextWindowTokens) ??
          numberField(body.context_window_tokens) ??
          numberField(body.max_tokens),
        source:
          typeof body.source === "string"
            ? (body.source as RuntimeStateSource)
            : "unknown",
        observedAt:
          typeof body.observedAt === "number" ? body.observedAt : Date.now(),
      };
    }

    const state = {
      ...observed,
      source: observed.source ?? "unknown",
      observedAt: observed.observedAt ?? Date.now(),
      configuredModel: persisted?.model_override,
      configuredEffort: persisted?.effort_override,
    } as CurrentRuntimeState;
    const pathId = input.binding.pathId ?? computePathId(input.binding.paths.root());
    setRuntimeState(input.participantId, state, pathId);
    await stateStore.updateControlState(input.participantId, {
      last_activity_at: new Date().toISOString(),
      idle_stopped_at: null,
      idle_stop_reason: null,
      pane_lifecycle: "live",
    });
    await this.deps.publishAgentUpdated(input.participantId, input.binding);
    return { status: 200, body: { ok: true, state } };
  }

  runtimeState(
    participantId: string,
    binding?: ManagedAgentRootBinding,
  ): { state: CurrentRuntimeState | null } {
    const pathId =
      binding !== undefined
        ? (binding.pathId ?? computePathId(binding.paths.root()))
        : undefined;
    return { state: getRuntimeState(participantId, pathId) ?? null };
  }

  async listModels(input: {
    participantId: string;
    refresh: boolean;
    binding?: ManagedAgentRootBinding;
  }): Promise<RouteResult<{ models: ModelDescriptor[] }>> {
    const agent = await this.readParticipant(input.participantId, input.binding);
    if (!agent.ok) return { status: agent.status, body: agent.body };
    const runtimeId = agent.participant.runtime_id ?? null;
    const adapter = getAdapter(runtimeId);
    if (!adapter) {
      return { status: 400, body: { error: `runtime has no adapter: ${runtimeId}` } };
    }
    try {
      return {
        status: 200,
        body: { models: await adapter.listModels({ refresh: input.refresh }) },
      };
    } catch (e) {
      return {
        status: 502,
        body: { error: e instanceof Error ? e.message : String(e) },
      };
    }
  }

  async listEfforts(input: {
    participantId: string;
    model?: string;
    binding?: ManagedAgentRootBinding;
  }): Promise<RouteResult<{ efforts: EffortDescriptor[] }>> {
    const agent = await this.readParticipant(input.participantId, input.binding);
    if (!agent.ok) return { status: agent.status, body: agent.body };
    const adapter = getAdapter(agent.participant.runtime_id ?? null);
    if (!adapter) {
      return {
        status: 400,
        body: {
          error: `runtime has no adapter: ${agent.participant.runtime_id}`,
        },
      };
    }
    try {
      return {
        status: 200,
        body: { efforts: await adapter.listEfforts(input.model) },
      };
    } catch (e) {
      return {
        status: 502,
        body: { error: e instanceof Error ? e.message : String(e) },
      };
    }
  }

  async updateRuntime(input: {
    participantId: string;
    binding?: ManagedAgentRootBinding;
    body: { model?: string | null; effort?: string | null; restart?: boolean };
  }): Promise<
    RouteResult<{
      ok: true;
      participant: Awaited<ReturnType<typeof setParticipantOverrides>>;
      restarted: boolean;
      restart_error?: string;
    }>
  > {
    const p = this.paths(input.binding);
    const state = this.state(input.binding);
    const participants = await listParticipants(p, { agentState: state });
    const participant = participants[input.participantId];
    if (!participant) {
      return {
        status: 404,
        body: { error: `agent not found: ${input.participantId}` },
      };
    }
    const adapter = getAdapter(participant.runtime_id ?? null);
    if (!adapter) {
      return {
        status: 400,
        body: { error: `runtime has no adapter: ${participant.runtime_id}` },
      };
    }

    let patch: RuntimeOverridePatch;
    try {
      patch = await validateRuntimeModelPatch({
        adapter,
        runtimeId: participant.runtime_id,
        model: input.body.model,
        effort: input.body.effort,
        fallbackModel: participant.model_override,
      });
    } catch (e) {
      if (e instanceof RuntimeModelValidationError) {
        return { status: e.status, body: { error: e.message } };
      }
      throw e;
    }

    const persisted = await setParticipantOverrides(p, input.participantId, {
      model: patch.model,
      effort: patch.effort,
    });
    setRuntimeState(input.participantId, {
      source: "override",
      observedAt: Date.now(),
      model: persisted.model_override,
      effort: persisted.effort_override,
      configuredModel: persisted.model_override,
      configuredEffort: persisted.effort_override,
    });

    const restart = await this.restartIfRequested({
      participantId: input.participantId,
      state,
      restart: input.body.restart,
      persisted,
      binding: input.binding,
    });
    await this.deps.publishAgentUpdated(input.participantId, input.binding);
    return {
      status: 200,
      body: {
        ok: true,
        participant: persisted,
        restarted: restart.restarted,
        restart_error: restart.error,
      },
    };
  }

  private async readParticipant(
    participantId: string,
    binding?: ManagedAgentRootBinding,
  ): Promise<
    | {
        ok: true;
        participant: Awaited<ReturnType<typeof listParticipants>>[string];
      }
    | ({ ok: false } & ErrorResult)
  > {
    const p = this.paths(binding);
    const participants = await listParticipants(p, {
      agentState: this.state(binding),
    });
    const participant = participants[participantId];
    if (!participant) {
      return {
        ok: false,
        status: 404,
        body: { error: `agent not found: ${participantId}` },
      };
    }
    return { ok: true, participant };
  }

  private async restartIfRequested(input: {
    participantId: string;
    state: AgentStateStore;
    restart?: boolean;
    persisted: { model_override?: string; effort_override?: string };
    binding?: ManagedAgentRootBinding;
  }): Promise<{ restarted: boolean; error?: string }> {
    if (input.restart === false) return { restarted: false };
    const tmuxSession = await input.state.readTmuxSession(input.participantId);
    if (!tmuxSession) return { restarted: false };
    try {
      await this.deps.tmux.killSession(tmuxSession);
      await input.state.clearManagedSiblings(input.participantId);
      this.deps.tracker.clearManagedPane(input.participantId);
      await input.state.appendLog(input.participantId, {
        event: "runtime-override-applied",
        model: input.persisted.model_override ?? null,
        effort: input.persisted.effort_override ?? null,
      });
      const respawn = await this.respawnAgent(
        input.participantId,
        input.persisted,
        input.binding,
      );
      return { restarted: respawn.ok, error: respawn.error };
    } catch (e) {
      return {
        restarted: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private async respawnAgent(
    participantId: string,
    override: { model_override?: string; effort_override?: string },
    binding?: ManagedAgentRootBinding,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const p = this.paths(binding);
      const state = this.state(binding);
      const runtimeId = await state.readRuntime(participantId);
      if (!runtimeId) return { ok: false, error: "no runtime_id" };
      const runtimes = await loadRuntimeRegistry({
        fallback: this.deps.fallbackPaths,
        ref: this.deps.pathContextRef,
      });
      const runtime = runtimes.runtimes[runtimeId];
      if (!runtime) return { ok: false, error: `unknown runtime: ${runtimeId}` };
      const activeSession = await state.readActiveSession(participantId);
      const userParticipantId = await this.deps.firstUserParticipantId(p);
      const prompt = buildLaunchPrompt({
        sessionId: activeSession ?? undefined,
        sessionSlug:
          activeSession !== null
            ? await readSessionSlug(p, activeSession)
            : undefined,
        participantId,
        userParticipantId: userParticipantId ?? "us-yourname",
        runtimeId,
        projectRoot: p.root(),
        mcpStatus: "unknown",
        hooksStatus: "unknown",
        recentEvents: await readLaunchRecentEvents(p, activeSession),
      });
      const pointerPrompt = await materializeLaunchPacket({
        p,
        participantId,
        sessionId: activeSession ?? undefined,
        fullPrompt: prompt,
      });
      const spawnArgs = spawnArgsForRuntime({
        runtimeId,
        args: runtime.args,
        desiredName: activeSession,
        launchPrompt: pointerPrompt,
        override: this.runtimeOverride(override),
        accessMode: normalizeAccessMode(
          runtimeId,
          (await state.readControlState(participantId)).access_mode,
        ),
      });
      await this.deps.ensureLaunchProjectConnection(p);
      const { sessionName } = await this.deps.tmux.spawnAgent({
        participantId,
        executable: runtime.executable,
        args: spawnArgs.args,
        env: {
          ...(runtime.env ?? {}),
          F_MARK_RUNTIME_ID: runtimeId,
          F_MARK_PATH: p.root(),
          ...(userParticipantId !== undefined
            ? { F_MARK_USER_ID: userParticipantId }
            : {}),
          ...(activeSession !== null
            ? { F_MARK_SESSION_ID: activeSession }
            : {}),
        },
      });
      await state.writeTmuxSession(participantId, sessionName);
      await state.writeRuntime(participantId, runtimeId);
      await state.updateControlState(participantId, {
        activity_state: "notified",
      });
      this.deps.tracker.setManagedPane(participantId, {
        paneAlive: () => this.deps.paneAlive(sessionName),
      });
      this.deps.scheduleCodexLiveTextPolling({
        participantId,
        sessionId: activeSession,
        runtimeId,
        binding,
        reset: true,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private runtimeOverride(
    override: { model_override?: string; effort_override?: string },
  ): RuntimeOverridePatch | undefined {
    if (!override.model_override && !override.effort_override) return undefined;
    return {
      model: override.model_override,
      effort: override.effort_override,
    };
  }

  private paths(binding?: ManagedAgentRootBinding): Paths {
    return binding?.paths ?? this.deps.routePaths();
  }

  private state(binding?: ManagedAgentRootBinding): AgentStateStore {
    return binding?.state ?? this.deps.agentState();
  }
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}
