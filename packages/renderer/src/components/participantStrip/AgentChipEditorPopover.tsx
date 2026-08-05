import type { CSSProperties, JSX } from "react";
import { createPortal } from "react-dom";
import type {
  EffortDescriptor,
  ModelDescriptor,
  PresenceState,
} from "@f-mark/shared";
import {
  PRESENCE_STATES,
  defaultRuntimeAccessMode,
  runtimeAccessModeLabel,
  runtimeAccessModeOptions,
} from "@f-mark/shared";
import { Popover } from "../../popovers/Popover.js";
import type {
  AgentChipRuntimeOptions,
  AgentChipEditorValues,
} from "./AgentChipEditor.js";
import type { AgentChipModel } from "./types.js";

interface AgentChipEditorPopoverProps {
  agent: AgentChipModel;
  anchorRect: DOMRect;
  values: AgentChipEditorValues;
  options: AgentChipRuntimeOptions;
  onModelChange(value: string): void;
  onEffortChange(value: string): void;
  onAccessModeChange(value: string): void;
  presenceState: PresenceState;
  onCompact(): void;
  onReconnect(): void;
  onOpenTerminal(): void;
  onRefresh(): void;
  onClear(): void;
  onSayGoodbye(): void;
  onClose(): void;
  closing?: boolean;
}

const savingLabels = {
  access: "Saving permissions",
  compact: "Compacting",
  effort: "Saving effort",
  model: "Saving model",
} as const;

const NO_LOOSE_STRING_VALUES = {
  access: "access",
  compact: "compact",
  effort: "effort",
  model: "model",
  removed: "removed",
  defaultEffort: "default",
  offline: "Offline",
  connecting: "Connecting",
  exited: "Exited",
  hookMissing: "Hook missing",
  wordSeparator: " ",
} as const;

export function AgentChipEditorPopover({
  agent,
  anchorRect,
  values,
  options,
  onModelChange,
  onEffortChange,
  onAccessModeChange,
  presenceState,
  onCompact,
  onReconnect,
  onOpenTerminal,
  onRefresh,
  onClear,
  onSayGoodbye,
  onClose,
  closing = false,
}: AgentChipEditorPopoverProps): JSX.Element {
  const modelOptions = withCurrentModel(options.models ?? [], values.model);
  const effortOptions = withCurrentEffort(options.efforts ?? [], values.effort);
  const accessOptions = withCurrentAccess(agent.runtime_id, values.accessMode);
  const managed = agent.isManaged;
  const context = contextStats(agent);
  const status = options.loading
    ? "Loading catalog"
    : options.saving !== null
      ? savingLabels[options.saving]
      : statusLabel(presenceState);
  const connected = presenceState !== PRESENCE_STATES.offline;
  const loadingRuntimeOptions = options.loading;
  const canUseLiveControls = managed && connected && agent.controllable !== false;
  const canReconnect = managed && agent.membership_state !== NO_LOOSE_STRING_VALUES.removed;
  const canOpenTerminal = connected && agent.tmux_session !== null;
  const canClear = canUseLiveControls;

  return createPortal(
    <Popover
      anchorRect={anchorRect}
      placement="top-start"
      onClose={onClose}
      closing={closing}
      className="agent-chip-editor-pop"
      ariaLabel={`${agent.name} model and runtime controls`}
    >
      <div
        className="agent-runtime-pop"
        style={
          agent.runtime_id !== null
            ? ({ "--agent-runtime-label": `"${agent.runtime_id}"` } as CSSProperties)
            : undefined
        }
      >
        <div className="agent-runtime-pop-glow" aria-hidden="true" />

        <header className="agent-runtime-pop-head">
          <div className="agent-runtime-pop-avatar" aria-hidden="true">
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div className="agent-runtime-pop-title">
            <span>Agent runtime</span>
            <strong>{agent.name}</strong>
            <p>{status} · {agent.runtime_id ?? "No runtime"}</p>
          </div>
          <div className="agent-runtime-pop-state">{status}</div>
        </header>

        <section className="agent-runtime-pop-section agent-runtime-pop-section-runtime">
          <div className="agent-runtime-section-head">
            <span>Model</span>
            <em>{values.model.length > 0 ? shortRuntimeValue(values.model) : "provider default"}</em>
          </div>
          {loadingRuntimeOptions ? (
            <div className="agent-runtime-skeleton-stack" aria-label="Loading runtime controls">
              <span className="agent-runtime-skeleton agent-runtime-skeleton-wide" />
              <span className="agent-runtime-skeleton agent-runtime-skeleton-mid" />
              <span className="agent-runtime-skeleton agent-runtime-skeleton-short" />
            </div>
          ) : (
            <>
              <label className="agent-runtime-field agent-runtime-field-wide">
                <span>Selected model</span>
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
              <label className="agent-runtime-field">
                <span>Reasoning effort</span>
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
              <div className="agent-runtime-mini-card">
                <span>Current effort</span>
                <strong>{values.effort.length > 0 ? values.effort : NO_LOOSE_STRING_VALUES.defaultEffort}</strong>
              </div>
            </>
          )}
        </section>

        <section className="agent-runtime-pop-section">
          <div className="agent-runtime-section-head">
            <span>Permissions</span>
            <em>{runtimeAccessModeLabel(agent.runtime_id, values.accessMode)}</em>
          </div>
          <label className="agent-runtime-field agent-runtime-field-wide">
            <span>Approval mode</span>
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
        </section>

        <section className="agent-runtime-pop-section">
          <div className="agent-runtime-section-head">
            <span>Context</span>
            <em>{context.label}</em>
          </div>
          <div
            className="agent-runtime-context-meter"
            style={
              context.percent !== null
                ? ({ "--agent-runtime-context": `${context.percent}%` } as CSSProperties)
                : undefined
            }
          >
            <span />
          </div>
          <p className="agent-runtime-note">{context.note}</p>
        </section>

        <section className="agent-runtime-pop-section agent-runtime-pop-section-actions">
          <div className="agent-runtime-section-head">
            <span>Actions</span>
          </div>
          <div className="agent-runtime-actions-grid">
            <button
              type="button"
              className="agent-runtime-action-tile"
              disabled={!canReconnect}
              onClick={onReconnect}
            >
              <i aria-hidden="true">↝</i>
              <span>Reconnect</span>
            </button>
            <button
              type="button"
              className="agent-runtime-action-tile"
              disabled={!canUseLiveControls || options.saving === NO_LOOSE_STRING_VALUES.compact}
              onClick={onCompact}
            >
              <i aria-hidden="true">↯</i>
              <span>Compact</span>
            </button>
            <button
              type="button"
              className="agent-runtime-action-tile"
              disabled={!canOpenTerminal}
              onClick={onOpenTerminal}
            >
              <i aria-hidden="true">›_</i>
              <span>Terminal</span>
            </button>
            <button
              type="button"
              className="agent-runtime-action-tile agent-runtime-action-strong"
              onClick={onRefresh}
            >
              <i aria-hidden="true">↻</i>
              <span>Refresh</span>
            </button>
          </div>
        </section>

        <section className="agent-runtime-pop-section agent-runtime-pop-section-advanced">
          <div className="agent-runtime-section-head">
            <span>Advanced</span>
            <em>⌃</em>
          </div>
          <button
            type="button"
            className="agent-runtime-row-action"
            disabled={!canClear}
            onClick={onClear}
          >
            <i aria-hidden="true">⌫</i>
            Clear context
          </button>
          <button
            type="button"
            className="agent-runtime-row-action agent-runtime-row-danger"
            disabled={!managed}
            onClick={onSayGoodbye}
          >
            <i aria-hidden="true">↳</i>
            Say goodbye
          </button>
          {options.error !== null ? (
            <p className="agent-runtime-error" role="alert">
              {options.error}
            </p>
          ) : !managed ? (
            <p className="agent-runtime-note">This participant is not managed, so runtime controls are read-only.</p>
          ) : null}
        </section>
      </div>
    </Popover>,
    document.body,
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

function shortRuntimeValue(value: string): string {
  if (value.includes("/")) return value.split("/").pop() ?? value;
  return value;
}

function statusLabel(state: PresenceState): string {
  switch (state) {
    case PRESENCE_STATES.offline:
      return NO_LOOSE_STRING_VALUES.offline;
    case PRESENCE_STATES.launching:
      return NO_LOOSE_STRING_VALUES.connecting;
    case PRESENCE_STATES.paneDead:
      return NO_LOOSE_STRING_VALUES.exited;
    case PRESENCE_STATES.hookNotInstalled:
      return NO_LOOSE_STRING_VALUES.hookMissing;
    default:
      return state.replace(/-/g, NO_LOOSE_STRING_VALUES.wordSeparator);
  }
}

function contextStats(agent: AgentChipModel): {
  percent: number | null;
  label: string;
  note: string;
} {
  const used = agent.runtime_state?.contextUsedTokens;
  const max = agent.runtime_state?.contextWindowTokens;
  if (typeof used !== "number" || typeof max !== "number" || max <= 0) {
    return {
      percent: null,
      label: "pending",
      note: "Context telemetry is pending; usage appears after the runtime reports token data.",
    };
  }
  const percent = Math.max(0, Math.min(100, Math.round((used / max) * 100)));
  return {
    percent,
    label: `${percent}% used`,
    note: `${formatTokens(used)} used of ${formatTokens(max)} available tokens.`,
  };
}

function formatTokens(value: number): string {
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}
