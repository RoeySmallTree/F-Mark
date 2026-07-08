import type {
  AgentAccessStatus,
  AgentConnectionState,
  AgentContextStatus,
  AgentPaneLifecycle,
  AgentSessionMembership,
  AgentStatusRow,
  CurrentRuntimeState,
  ManagedAgentsStatusResponse,
  ManagedAgentControlState,
  ModelDescriptor,
  RuntimeSessionInfo,
} from "@f-mark/shared";
import {
  RUNTIME_CONTROL_CAPABILITIES,
  runtimeCapabilities,
} from "../../agents/capabilities.js";
import { listParticipants } from "../../participants.js";
import { getAdapter } from "../../runtimes/adapters/index.js";
import type { AgentStateStore } from "../../services/agentState.js";
import { getRuntimeState } from "../../services/runtimeState.js";
import { computePathId } from "../../paths/identity.js";
import type { TmuxManager } from "../../tmux/manager.js";
import { normalizeAccessMode } from "./runtimeAccess.js";
import { pendingAccessCounts } from "./accessEvents.js";
import type { ManagedAgentRootBinding } from "./types.js";

function connectionState(input: {
  managed: boolean;
  tmuxSession: string | null;
  liveSessionNames: ReadonlySet<string>;
}): AgentConnectionState {
  if (input.managed && input.tmuxSession !== null) {
    return input.liveSessionNames.has(input.tmuxSession)
      ? "connected"
      : "detached";
  }
  return "offline";
}

function derivePaneLifecycle(input: {
  control: ManagedAgentControlState;
  connection: AgentConnectionState;
  tmuxSession: string | null;
  removed: boolean;
}): AgentPaneLifecycle {
  if (input.removed) return "dead";
  if (input.tmuxSession === null) return "no-pane";
  if (input.connection === "connected") return "live";
  if (input.connection === "detached") return "detached";
  if (
    input.control.pane_lifecycle === "idle-stopped" ||
    input.control.pane_lifecycle === "dead"
  ) {
    return input.control.pane_lifecycle;
  }
  return "no-pane";
}

function agentCanReceiveCommands(input: {
  managed: boolean;
  connection: AgentConnectionState;
  tmuxSession: string | null;
  lifecycle: AgentPaneLifecycle;
  removed: boolean;
}): boolean {
  return (
    !input.removed &&
    input.managed &&
    input.tmuxSession !== null &&
    input.connection === "connected" &&
    input.lifecycle === "live"
  );
}

type ParticipantRecord = Awaited<ReturnType<typeof listParticipants>>[string];

function contextStatus(input: {
  runtimeId: string | null;
  runtimeState: CurrentRuntimeState | undefined;
}): AgentContextStatus {
  const usedTokens = input.runtimeState?.contextUsedTokens ?? null;
  const maxTokens = input.runtimeState?.contextWindowTokens ?? null;
  const caps = runtimeCapabilities(input.runtimeId);
  if (usedTokens !== null || maxTokens !== null) {
    return {
      status: "reported",
      used_tokens: usedTokens,
      max_tokens: maxTokens,
      source: caps.context_source,
      ...(usedTokens === null
        ? {
            reason:
              "Used context telemetry is pending; available context comes from the selected model.",
          }
        : {}),
    };
  }

  if (caps.context_source === "unsupported") {
    return {
      status: "unsupported",
      used_tokens: null,
      max_tokens: null,
      source: caps.context_source,
      reason: caps.context_reason ?? "Context usage is unsupported for this runtime.",
    };
  }
  return {
    status: "not-reported",
    used_tokens: null,
    max_tokens: null,
    source: caps.context_source,
    reason: caps.context_reason ?? "Context usage is not reported by this runtime.",
  };
}

function accessStatus(input: {
  runtimeId: string | null;
  mode: string;
}): AgentAccessStatus {
  const caps = runtimeCapabilities(input.runtimeId);
  const mode = normalizeAccessMode(input.runtimeId, input.mode);
  const canChange = caps.access_modes.length > 0;
  return {
    mode,
    supported_modes: caps.access_modes,
    change_supported: canChange,
    ...(caps.access_change_reason !== undefined
      ? { reason: caps.access_change_reason }
      : {}),
  };
}

async function reconcileRemovedMembership(input: {
  state: AgentStateStore;
  participantId: string;
  sessionId: string;
  runtimeId: string | null;
  tmuxSession: string | null;
  managed: boolean;
  control: ManagedAgentControlState;
}): Promise<AgentSessionMembership | null> {
  const existing = await input.state.readRemovedMembership(
    input.participantId,
    input.sessionId,
  );
  if (existing !== null) return existing;
  if (input.tmuxSession !== null || input.managed) return null;
  if ((await latestLifecycleEvent(input.state, input.participantId)) !== "goodbye") {
    return null;
  }

  const lastTmuxSession = input.control.last_tmux_session ?? null;
  const removed = await input.state.markSessionRemoved(input.participantId, {
    sessionId: input.sessionId,
    runtimeId: input.runtimeId,
    reason: "migration",
    lastTmuxSession,
  });
  await input.state.clearActiveSession(input.participantId);
  await input.state.updateControlState(input.participantId, {
    activity_state: "idle",
    idle_stopped_at: null,
    idle_stop_reason: null,
    last_tmux_session: lastTmuxSession,
    pane_lifecycle: "dead",
  });
  return removed;
}

async function latestLifecycleEvent(
  state: AgentStateStore,
  participantId: string,
): Promise<string | null> {
  const entries = await state.readLog(participantId, { limit: 30 });
  for (let i = entries.length - 1; i >= 0; i--) {
    const event = entries[i]?.event;
    if (event === "goodbye" || event === "spawn") return event;
  }
  return null;
}

function buildRemovedStatusRow(input: {
  participantId: string;
  displayName: string;
  runtimeId: string | null;
  runtimeSession: RuntimeSessionInfo | null;
  control: ManagedAgentControlState;
  removed: AgentSessionMembership;
  runtimeState: CurrentRuntimeState | undefined;
}): AgentStatusRow {
  return {
    participant_id: input.participantId,
    display_name: input.displayName,
    runtime_id: input.runtimeId,
    active_session: null,
    membership_session_id: input.removed.session_id,
    membership_state: "removed",
    pane_lifecycle: "dead",
    controllable: false,
    ...(input.removed.removed_at !== undefined
      ? { removed_at: input.removed.removed_at }
      : {}),
    ...(input.removed.removed_reason !== undefined
      ? { removed_reason: input.removed.removed_reason }
      : {}),
    runtime_session: input.runtimeSession,
    managed: false,
    paused: input.control.paused,
    connection_state: "offline",
    activity_state: "idle",
    tmux_session: null,
    mcp_status: "unknown",
    hook_status: "unknown",
    context: contextStatus({
      runtimeId: input.runtimeId,
      runtimeState: input.runtimeState,
    }),
    access: accessStatus({
      runtimeId: input.runtimeId,
      mode: input.control.access_mode,
    }),
    pending_access_count: 0,
    runtime_state: input.runtimeState,
  };
}

export class ManagedAgentStatusService {
  constructor(private readonly deps: { tmux: TmuxManager }) {}

  async buildRows(
    sessionFilter: string | undefined,
    binding: ManagedAgentRootBinding,
  ): Promise<ManagedAgentsStatusResponse> {
    const p = binding.paths;
    const state = binding.state;
    const participants = await listParticipants(p, { agentState: state });
    const pendingCounts = await pendingAccessCounts({ p, sessionFilter });
    const managedIds = new Set(await state.listManagedAgentIds());
    const liveSessionNames = new Set(
      (await this.deps.tmux.listFmarkSessions(binding.tmuxRoot ?? undefined)).map(
        (session) => session.sessionName,
      ),
    );
    const agents: AgentStatusRow[] = [];
    const removedAgents: AgentStatusRow[] = [];

    for (const [participantId, participant] of Object.entries(participants)) {
      if (participant.kind !== "agent") continue;
      let activeSession = participant.active_session;
      const runtimeId =
        participant.runtime_id ?? (await state.readRuntime(participantId));
      const tmuxSession = await state.readTmuxSession(participantId);
      const runtimeSession = await state.readRuntimeSession(participantId);
      let control = await state.readControlState(participantId);
      const pendingAccessCount = pendingCounts.get(participantId) ?? 0;
      const managed = managedIds.has(participantId);
      if (activeSession !== null) {
        const removed = await reconcileRemovedMembership({
          state,
          participantId,
          sessionId: activeSession,
          runtimeId,
          tmuxSession,
          managed,
          control,
        });
        if (removed !== null) {
          activeSession = null;
          control = await state.readControlState(participantId);
        }
      }
      if (sessionFilter !== undefined && activeSession !== sessionFilter) continue;
      const runtimeState = await this.runtimeStateForParticipant({
        participantId,
        participant,
        runtimeId,
        pathId: binding.pathId ?? computePathId(binding.paths.root()),
      });
      const connection = connectionState({
        managed,
        tmuxSession,
        liveSessionNames,
      });
      const paneLifecycle = derivePaneLifecycle({
        control,
        connection,
        tmuxSession,
        removed: false,
      });
      const controllable = agentCanReceiveCommands({
        managed,
        connection,
        tmuxSession,
        lifecycle: paneLifecycle,
        removed: false,
      });
      const activityState = pendingAccessCount > 0
        ? "access-pending"
        : controllable
          ? control.activity_state
          : "idle";
      agents.push({
        participant_id: participantId,
        display_name: participant.name,
        runtime_id: runtimeId,
        active_session: activeSession,
        membership_session_id: activeSession,
        membership_state: "active",
        pane_lifecycle: paneLifecycle,
        controllable,
        runtime_session: runtimeSession,
        managed,
        paused: control.paused,
        connection_state: connection,
        activity_state: activityState,
        tmux_session: tmuxSession,
        mcp_status: "unknown",
        hook_status: "unknown",
        context: contextStatus({ runtimeId, runtimeState }),
        access: accessStatus({
          runtimeId,
          mode: control.access_mode,
        }),
        pending_access_count: pendingAccessCount,
        runtime_state: runtimeState,
      });
    }

    if (sessionFilter !== undefined) {
      for (const [participantId, participant] of Object.entries(participants)) {
        if (participant.kind !== "agent") continue;
        const removed = await state.readRemovedMembership(participantId, sessionFilter);
        if (removed === null) continue;
        const runtimeId =
          participant.runtime_id ?? removed.runtime_id ?? (await state.readRuntime(participantId));
        const control = await state.readControlState(participantId);
        const runtimeState = await this.runtimeStateForParticipant({
          participantId,
          participant,
          runtimeId,
          pathId: binding.pathId ?? computePathId(binding.paths.root()),
        });
        removedAgents.push(
          buildRemovedStatusRow({
            participantId,
            displayName: participant.name,
            runtimeId,
            runtimeSession: await state.readRuntimeSession(participantId),
            control,
            removed,
            runtimeState,
          }),
        );
      }
    }

    agents.sort((a, b) => a.display_name.localeCompare(b.display_name));
    removedAgents.sort((a, b) => a.display_name.localeCompare(b.display_name));
    return {
      agents,
      removed_agents: removedAgents,
      capabilities: RUNTIME_CONTROL_CAPABILITIES,
    };
  }

  async buildRow(
    participantId: string,
    binding: ManagedAgentRootBinding,
  ): Promise<AgentStatusRow | null> {
    const status = await this.buildRows(undefined, binding);
    return status.agents.find((agent) => agent.participant_id === participantId) ?? null;
  }

  private async runtimeStateForParticipant(input: {
    participantId: string;
    participant: ParticipantRecord;
    runtimeId: string | null;
    pathId: string;
  }): Promise<CurrentRuntimeState | undefined> {
    const live = getRuntimeState(input.participantId, input.pathId);
    const models = await this.modelsForRuntime(input.runtimeId);
    const configuredModel = input.participant.model_override;
    const configuredEffort = input.participant.effort_override;
    const selectedModel = selectedModelDescriptor(
      models,
      live?.model ?? live?.configuredModel ?? configuredModel,
    );
    const model =
      live?.model ??
      live?.configuredModel ??
      configuredModel ??
      selectedModel?.id;
    const effort =
      live?.effort ??
      live?.configuredEffort ??
      configuredEffort ??
      selectedModel?.defaultEffort ??
      selectedModel?.efforts?.[0]?.id;
    const contextWindowTokens =
      live?.contextWindowTokens ??
      selectedModel?.contextWindowTokens ??
      selectedModel?.maxContextWindowTokens;

    if (live !== undefined) {
      return {
        ...live,
        ...(model !== undefined ? { model } : {}),
        ...(effort !== undefined ? { effort } : {}),
        ...(contextWindowTokens !== undefined ? { contextWindowTokens } : {}),
        configuredModel: live.configuredModel ?? configuredModel,
        configuredEffort: live.configuredEffort ?? configuredEffort,
      };
    }

    if (
      model === undefined &&
      effort === undefined &&
      contextWindowTokens === undefined
    ) {
      return undefined;
    }

    return {
      ...(model !== undefined ? { model } : {}),
      ...(effort !== undefined ? { effort } : {}),
      ...(contextWindowTokens !== undefined ? { contextWindowTokens } : {}),
      source: configuredModel !== undefined || configuredEffort !== undefined
        ? "override"
        : "config",
      observedAt: Date.now(),
      configuredModel,
      configuredEffort,
    };
  }

  private async modelsForRuntime(
    runtimeId: string | null,
  ): Promise<ModelDescriptor[]> {
    const adapter = getAdapter(runtimeId);
    if (adapter == null) return [];
    try {
      return await adapter.listModels();
    } catch {
      return [];
    }
  }
}

function selectedModelDescriptor(
  models: ModelDescriptor[],
  modelId: string | undefined,
): ModelDescriptor | undefined {
  if (modelId !== undefined) {
    const exact = models.find((model) => model.id === modelId);
    if (exact !== undefined) return exact;
  }
  return models[0];
}
