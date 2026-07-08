import { useCallback, useEffect, useState } from "react";
import { defaultRuntimeAccessMode } from "@f-mark/shared";
import type { ManagedAgentsClient } from "../../api/managedAgents.js";
import { ManagedAgentsApiError } from "../../api/managedAgents.js";
import type { RootScope } from "../../api/rootScope.js";
import type {
  AgentChipEditorValues,
  AgentChipRuntimeOptions,
} from "./AgentChipEditor.js";
import type { AgentChipModel } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  model: "model",
  effort: "effort",
  access: "access",
  compact: "compact",
  none: "none",
} as const;

export interface AgentChipEditorController {
  expandedAgentId: string | null;
  valuesForAgent(agent: AgentChipModel): AgentChipEditorValues;
  optionsForAgent(agent: AgentChipModel): AgentChipRuntimeOptions;
  toggleEditor(agent: AgentChipModel): void;
  closeEditor(): void;
  setModel(agent: AgentChipModel, value: string): void;
  setEffort(agent: AgentChipModel, value: string): void;
  setAccessMode(agent: AgentChipModel, value: string): void;
  compact(agent: AgentChipModel): void;
}

type AgentChipSaving = AgentChipRuntimeOptions["saving"];
type AgentOptionMap = Record<string, AgentChipRuntimeOptions>;
type AgentValueMap = Record<string, Partial<AgentChipEditorValues>>;

const EMPTY_OPTIONS: AgentChipRuntimeOptions = {
  models: [],
  efforts: [],
  loading: false,
  error: null,
  saving: null,
};

export function useAgentChipEditorController({
  agents,
  apiClient,
  currentScope,
  onOpenEditor,
}: {
  agents: AgentChipModel[];
  apiClient: ManagedAgentsClient;
  currentScope: RootScope | null;
  onOpenEditor(): void;
}): AgentChipEditorController {
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [optionsByAgent, setOptionsByAgent] = useState<AgentOptionMap>({});
  const [valuesByAgent, setValuesByAgent] = useState<AgentValueMap>({});
  const currentScopeKey = scopeKey(currentScope);

  useEffect(() => {
    setOptionsByAgent({});
  }, [currentScopeKey]);

  useEffect(() => {
    if (
      expandedAgentId !== null &&
      agents.every((agent) => agent.participant_id !== expandedAgentId)
    ) {
      setExpandedAgentId(null);
    }
  }, [agents, expandedAgentId]);

  const valuesForAgent = useCallback(
    (agent: AgentChipModel): AgentChipEditorValues => {
      const local = valuesByAgent[agent.participant_id];
      return {
        model:
          local?.model ??
          agent.runtime_state?.configuredModel ??
          agent.runtime_state?.model ??
          "",
        effort:
          local?.effort ??
          agent.runtime_state?.configuredEffort ??
          agent.runtime_state?.effort ??
          "",
        accessMode:
          local?.accessMode ??
          agent.access_mode ??
          defaultRuntimeAccessMode(agent.runtime_id),
      };
    },
    [valuesByAgent],
  );

  const optionsForAgent = useCallback(
    (agent: AgentChipModel): AgentChipRuntimeOptions =>
      optionsByAgent[agent.participant_id] ?? EMPTY_OPTIONS,
    [optionsByAgent],
  );

  const loadOptions = useCallback(
    (agent: AgentChipModel, modelOverride?: string): void => {
      const id = agent.participant_id;
      if (!agent.isManaged) {
        setOptionsByAgent((prev) => ({ ...prev, [id]: EMPTY_OPTIONS }));
        return;
      }
      setOptionsByAgent((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? EMPTY_OPTIONS),
          loading: true,
          error: null,
        },
      }));
      const model =
        modelOverride ??
        agent.runtime_state?.configuredModel ??
        agent.runtime_state?.model;
      void Promise.all([
        apiClient.runtimeModels(id, { scope: currentScope }),
        apiClient.runtimeEfforts(id, model, currentScope),
      ])
        .then(([models, efforts]) => {
          setOptionsByAgent((prev) => ({
            ...prev,
            [id]: {
              ...(prev[id] ?? EMPTY_OPTIONS),
              models,
              efforts,
              loading: false,
              error: null,
            },
          }));
        })
        .catch((err) => {
          setOptionsByAgent((prev) => ({
            ...prev,
            [id]: {
              ...(prev[id] ?? EMPTY_OPTIONS),
              loading: false,
              error: optionErrorMessage(err),
            },
          }));
        });
    },
    [apiClient, currentScope],
  );

  const toggleEditor = useCallback(
    (agent: AgentChipModel): void => {
      onOpenEditor();
      setExpandedAgentId((current) => {
        const next = current === agent.participant_id ? null : agent.participant_id;
        if (next !== null && optionsByAgent[agent.participant_id] === undefined) {
          loadOptions(agent);
        }
        return next;
      });
    },
    [loadOptions, onOpenEditor, optionsByAgent],
  );

  const closeEditor = useCallback((): void => {
    setExpandedAgentId(null);
  }, []);

  const patchValue = useCallback(
    (id: string, value: Partial<AgentChipEditorValues>): void => {
      setValuesByAgent((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? {}), ...value },
      }));
    },
    [],
  );

  const setSaving = useCallback(
    (id: string, saving: AgentChipSaving, error: string | null = null): void => {
      setOptionsByAgent((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? EMPTY_OPTIONS),
          saving,
          error,
        },
      }));
    },
    [],
  );

  const setModel = useCallback(
    (agent: AgentChipModel, value: string): void => {
      const id = agent.participant_id;
      patchValue(id, { model: value });
      setSaving(id, NO_LOOSE_STRING_VALUES.model);
      void apiClient
        .setRuntime(id, { model: value.length > 0 ? value : null }, currentScope)
        .then(() => apiClient.runtimeEfforts(id, value, currentScope))
        .then((efforts) => {
          setOptionsByAgent((prev) => ({
            ...prev,
            [id]: {
              ...(prev[id] ?? EMPTY_OPTIONS),
              efforts,
              saving: null,
              error: null,
            },
          }));
        })
        .catch((err) => setSaving(id, null, optionErrorMessage(err)));
    },
    [apiClient, currentScope, patchValue, setSaving],
  );

  const setEffort = useCallback(
    (agent: AgentChipModel, value: string): void => {
      const id = agent.participant_id;
      patchValue(id, { effort: value });
      setSaving(id, NO_LOOSE_STRING_VALUES.effort);
      void apiClient
        .setRuntime(id, { effort: value.length > 0 ? value : null }, currentScope)
        .then(() => setSaving(id, null))
        .catch((err) => setSaving(id, null, optionErrorMessage(err)));
    },
    [apiClient, currentScope, patchValue, setSaving],
  );

  const setAccessMode = useCallback(
    (agent: AgentChipModel, value: string): void => {
      const id = agent.participant_id;
      patchValue(id, { accessMode: value });
      setSaving(id, NO_LOOSE_STRING_VALUES.access);
      void apiClient
        .setAccess(id, { mode: value }, currentScope)
        .then(() => setSaving(id, null))
        .catch((err) => setSaving(id, null, optionErrorMessage(err)));
    },
    [apiClient, currentScope, patchValue, setSaving],
  );

  const compact = useCallback(
    (agent: AgentChipModel): void => {
      const id = agent.participant_id;
      setSaving(id, NO_LOOSE_STRING_VALUES.compact);
      void apiClient
        .compact(id, currentScope)
        .then(() => setSaving(id, null))
        .catch((err) => setSaving(id, null, optionErrorMessage(err)));
    },
    [apiClient, currentScope, setSaving],
  );

  return {
    expandedAgentId,
    valuesForAgent,
    optionsForAgent,
    toggleEditor,
    closeEditor,
    setModel,
    setEffort,
    setAccessMode,
    compact,
  };
}

function optionErrorMessage(err: unknown): string {
  if (
    err instanceof ManagedAgentsApiError &&
    err.status === 404 &&
    (err.backendError?.includes("agent not found") ?? false)
  ) {
    return "Agent state is stale";
  }
  return err instanceof Error ? err.message : String(err);
}

function scopeKey(scope: RootScope | null): string {
  if (scope === null) return NO_LOOSE_STRING_VALUES.none;
  return "pathId" in scope ? `path:${scope.pathId}` : `root:${scope.root}`;
}
