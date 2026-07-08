import type {
  AgentActivityState,
  CurrentRuntimeState,
  ModelDescriptor,
  RuntimeSessionInfo,
} from "@f-mark/shared";
import type { FastifyInstance } from "fastify";
import { listParticipants } from "../../../participants.js";
import { getAdapter } from "../../../runtimes/adapters/index.js";
import type { AgentStateStore } from "../../../services/agentState.js";
import { getRuntimeState } from "../../../services/runtimeState.js";
import type { ManagedAgentsRouteContext } from "../routeContext.js";
import { requireParticipantId } from "../routeRequest.js";

interface AgentListRow {
  participant_id: string;
  display_name: string;
  tmux_session: string | null;
  runtime_id: string | null;
  active_session: string | null;
  runtime_session: RuntimeSessionInfo | null;
  alive: boolean;
  activity_state: AgentActivityState;
  runtime_state?: CurrentRuntimeState;
  access_mode?: string;
}

export function registerManagedAgentListRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.get<{ Querystring: { path_id?: string; root?: string } }>(
    "/managed-agents",
    async (req, reply) => {
      const scoped = await context.optionalScopedBinding(req.query, reply);
      if (!scoped.ok) return scoped.body;
      const binding = scoped.binding;
      const state = binding.state;
      const p = binding.paths;
      const sessions = await context.tmux.listFmarkSessions(
        binding.tmuxRoot ?? undefined,
      );
      const liveSessionNames = new Set(sessions.map((s) => s.sessionName));
      const agentIds = await state.listManagedAgentIds();
      const persistedParticipants = await listParticipants(p, {
        agentState: state,
      });
      const agents = await Promise.all(
        agentIds.map((id) =>
          buildAgentListRow(
            state,
            id,
            liveSessionNames,
            persistedParticipants[id],
          ),
        ),
      );
      const terminals = sessions
        .filter((s) => s.kind === "terminal")
        .map((s) => ({
          tmux_session: s.sessionName,
          label: `terminal ${s.index}`,
          index: s.index,
        }));
      return { agents, terminals };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { since?: string } }>(
    "/managed-agents/:id/logs",
    async (req, reply) => {
      const participant = requireParticipantId(req.params.id, reply);
      if (!participant.ok) return participant.body;
      const limitRaw = req.query.since;
      const limit = limitRaw !== undefined ? Number(limitRaw) : 50;
      const entries = await context.agentState().readLog(participant.id, {
        limit,
      });
      return { entries };
    },
  );
}

async function buildAgentListRow(
  state: AgentStateStore,
  id: string,
  liveSessionNames: Set<string>,
  persisted: Awaited<ReturnType<typeof listParticipants>>[string] | undefined,
): Promise<AgentListRow> {
  const tmuxSession = await state.readTmuxSession(id);
  const runtimeId = await state.readRuntime(id);
  const runtimeSession = await state.readRuntimeSession(id);
  const activeSession = await state.readActiveSession(id);
  const control = await state.readControlState(id);
  const alive = tmuxSession !== null && liveSessionNames.has(tmuxSession);

  return {
    participant_id: id,
    display_name: persisted?.name ?? id,
    tmux_session: tmuxSession,
    runtime_id: runtimeId,
    active_session: persisted?.active_session ?? activeSession,
    runtime_session: runtimeSession,
    alive,
    activity_state: control.activity_state,
    runtime_state: await runtimeStateForParticipant(id, runtimeId, persisted),
    access_mode: control.access_mode,
  };
}

async function runtimeStateForParticipant(
  id: string,
  runtimeId: string | null,
  persisted: Awaited<ReturnType<typeof listParticipants>>[string] | undefined,
): Promise<CurrentRuntimeState | undefined> {
  const live = getRuntimeState(id);
  const models = await modelsForRuntime(runtimeId);
  const configuredModel = persisted?.model_override;
  const configuredEffort = persisted?.effort_override;
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

export async function modelsForRuntime(
  runtimeId: string | null,
  opts: { refresh?: boolean; swallowErrors?: boolean } = {},
): Promise<ModelDescriptor[]> {
  const adapter = getAdapter(runtimeId);
  if (adapter == null) return [];
  try {
    return await adapter.listModels({ refresh: opts.refresh });
  } catch (e) {
    if (opts.swallowErrors === false) throw e;
    return [];
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
