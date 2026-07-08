import type { JSX } from "react";
import type { EffortDescriptor, ModelDescriptor } from "@f-mark/shared";
import {
  defaultRuntimeAccessMode,
  runtimeAccessModeLabel,
  runtimeAccessModeOptions,
} from "@f-mark/shared";
import { Zap } from "lucide-react";
import type { AgentChipModel } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  model: "model",
  effort: "effort",
  access: "access",
  compact: "compact",
} as const;

export interface AgentChipEditorValues {
  model: string;
  effort: string;
  accessMode: string;
}

export interface AgentChipRuntimeOptions {
  models: ModelDescriptor[];
  efforts: EffortDescriptor[];
  loading: boolean;
  error: string | null;
  saving: "access" | "compact" | "effort" | "model" | null;
}

interface AgentChipEditorProps {
  agent: AgentChipModel;
  values: AgentChipEditorValues;
  options: AgentChipRuntimeOptions;
  onModelChange(value: string): void;
  onEffortChange(value: string): void;
  onAccessModeChange(value: string): void;
  onCompact(): void;
}

export function AgentChipEditor({
  agent,
  values,
  options,
  onModelChange,
  onEffortChange,
  onAccessModeChange,
  onCompact,
}: AgentChipEditorProps): JSX.Element {
  const modelOptions = withCurrentModel(options.models, values.model);
  const effortOptions = withCurrentEffort(options.efforts, values.effort);
  const accessOptions = withCurrentAccess(agent.runtime_id, values.accessMode);
  const managed = agent.isManaged;

  return (
    <div className="agent-chip-editor" data-testid="agent-chip-editor">
      <label className="agent-chip-select">
        <span>Model</span>
        <select
          value={values.model}
          disabled={!managed || options.saving === NO_LOOSE_STRING_VALUES.model}
          onChange={(event) => onModelChange(event.currentTarget.value)}
        >
          <option value="">Provider default</option>
          {modelOptions.map((model) => (
            <option key={model.id} value={model.id}>
              {modelLabel(model)}
            </option>
          ))}
        </select>
      </label>
      <label className="agent-chip-select">
        <span>Effort</span>
        <select
          value={values.effort}
          disabled={!managed || options.saving === NO_LOOSE_STRING_VALUES.effort}
          onChange={(event) => onEffortChange(event.currentTarget.value)}
        >
          <option value="">Provider default</option>
          {effortOptions.map((effort) => (
            <option key={effort.id} value={effort.id}>
              {effort.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className="agent-chip-select">
        <span>Permissions</span>
        <select
          value={values.accessMode}
          disabled={!managed || options.saving === NO_LOOSE_STRING_VALUES.access}
          onChange={(event) => onAccessModeChange(event.currentTarget.value)}
        >
          {accessOptions.map((mode) => (
            <option key={mode.id} value={mode.id}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="agent-chip-compact"
        disabled={!managed || options.saving === NO_LOOSE_STRING_VALUES.compact}
        title="Compact this agent's context"
        aria-label={`Compact ${agent.name} context`}
        onClick={onCompact}
      >
        <Zap size={12} aria-hidden="true" />
        <span>Compact</span>
      </button>
      {options.loading ? <span className="agent-chip-editor-note">Loading</span> : null}
      {options.error !== null ? (
        <span className="agent-chip-editor-note error">{options.error}</span>
      ) : null}
    </div>
  );
}

function withCurrentModel(
  models: ModelDescriptor[],
  currentModel: string,
): ModelDescriptor[] {
  if (
    currentModel.length === 0 ||
    models.some((model) => model.id === currentModel)
  ) {
    return models;
  }
  return [{ id: currentModel, displayName: currentModel }, ...models];
}

function withCurrentEffort(
  efforts: EffortDescriptor[],
  currentEffort: string,
): EffortDescriptor[] {
  if (
    currentEffort.length === 0 ||
    efforts.some((effort) => effort.id === currentEffort)
  ) {
    return efforts;
  }
  return [{ id: currentEffort, displayName: currentEffort }, ...efforts];
}

function withCurrentAccess(
  runtimeId: string | null,
  currentAccessMode: string,
): { id: string; label: string }[] {
  const options = runtimeAccessModeOptions(runtimeId).map((option) => ({
    id: option.id,
    label: option.label,
  }));
  const fallback =
    currentAccessMode.length > 0
      ? currentAccessMode
      : defaultRuntimeAccessMode(runtimeId);
  if (options.some((option) => option.id === fallback)) return options;
  return [
    {
      id: fallback,
      label: runtimeAccessModeLabel(runtimeId, fallback),
    },
    ...options,
  ];
}

function modelLabel(model: ModelDescriptor): string {
  if (model.displayName === model.id) return model.displayName;
  return `${model.displayName} (${model.id})`;
}
