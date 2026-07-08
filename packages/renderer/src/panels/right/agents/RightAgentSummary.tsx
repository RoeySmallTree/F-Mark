import { Check, Palette, Pencil, X } from "lucide-react";
import { AGENT_COLORS } from "../../../lib/agentNaming.js";
import {
  contextPercent,
  effortLabel,
  modelLabel,
  type RightAgentViewModel,
} from "./agentPresentation.js";
import type { RightAgentsController } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  runtime: "runtime",
  paused: "paused",
  connected: "connected",
  noPane: "no-pane",
  noPaneLabel: "no pane",
  removed: "removed",
} as const;

interface RightAgentSummaryProps {
  view: RightAgentViewModel;
  controller: RightAgentsController;
}

export function RightAgentSummary({
  view,
  controller,
}: RightAgentSummaryProps): JSX.Element {
  const { agent } = view;
  return (
    <div className="agent-status-summary">
      <div className="agent-status-main">
        <div className="agent-status-dot" aria-hidden="true" />
        <div className="agent-status-title">
          {view.isEditing ? (
            <RenameForm view={view} controller={controller} />
          ) : (
            <AgentTitle view={view} controller={controller} />
          )}
          <span>{agent.participant_id}</span>
        </div>
        {view.isPickingColor ? (
          <AgentColorPicker view={view} controller={controller} />
        ) : null}
        <div className="agent-status-badges">
          <span>{agent.runtime_id ?? NO_LOOSE_STRING_VALUES.runtime}</span>
          <span>{statusLabel(view)}</span>
          <span>{modelLabel(agent)}</span>
          <span>{effortLabel(agent)}</span>
          {contextPercent(agent) !== null ? (
            <span>{contextPercent(agent)}</span>
          ) : null}
          {agent.pending_access_count > 0 ? (
            <span>{agent.pending_access_count} approval</span>
          ) : null}
        </div>
        <span className="agent-row-affordance" aria-hidden="true">
          <span>Controls</span>
          <i>↗</i>
        </span>
      </div>
    </div>
  );
}

function statusLabel(view: RightAgentViewModel): string {
  const { agent } = view;
  if (agent.membership_state === NO_LOOSE_STRING_VALUES.removed)
    return NO_LOOSE_STRING_VALUES.removed;
  if (agent.pane_lifecycle === NO_LOOSE_STRING_VALUES.noPane)
    return NO_LOOSE_STRING_VALUES.noPaneLabel;
  if (agent.paused) return NO_LOOSE_STRING_VALUES.paused;
  if (agent.connection_state !== NO_LOOSE_STRING_VALUES.connected) return agent.connection_state;
  return agent.activity_state.replace(/-/g, " ");
}

function RenameForm({
  view,
  controller,
}: RightAgentSummaryProps): JSX.Element {
  const { agent } = view;
  const value = controller.editing?.value ?? "";
  return (
    <form
      className="agent-rename-form"
      onSubmit={(event) => {
        event.preventDefault();
        const next = value.trim();
        if (next.length === 0) return;
        void controller
          .renameAgent(agent, next)
          .then(() => controller.setEditing(null));
      }}
    >
      <input
        value={value}
        onChange={(event) =>
          controller.setEditing({
            id: agent.participant_id,
            value: event.target.value,
          })
        }
        autoFocus
      />
      <button type="submit" title="Save name" aria-label="Save name">
        <Check size={13} aria-hidden="true" />
      </button>
      <button
        type="button"
        title="Cancel rename"
        aria-label="Cancel rename"
        onClick={() => controller.setEditing(null)}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </form>
  );
}

function AgentTitle({
  view,
  controller,
}: RightAgentSummaryProps): JSX.Element {
  const { agent } = view;
  return (
    <div className="agent-title-line">
      <span
        className="agent-color-swatch"
        aria-hidden="true"
        title={
          view.agentColor !== null ? `Color ${view.agentColor}` : "No color set"
        }
        style={
          view.agentColor !== null ? { background: view.agentColor } : undefined
        }
      />
      <b>{agent.display_name}</b>
      <span className="agent-title-actions">
        <button
          type="button"
          className="agent-icon-link"
          title="Rename"
          aria-label={`Rename ${agent.display_name}`}
          onClick={(event) => {
            event.preventDefault();
            controller.setEditing({
              id: agent.participant_id,
              value: agent.display_name,
            });
          }}
        >
          <Pencil size={12} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="agent-icon-link"
          title={view.isPickingColor ? "Close color picker" : "Pick color"}
          aria-label={`Pick color for ${agent.display_name}`}
          aria-expanded={view.isPickingColor}
          onClick={(event) => {
            event.preventDefault();
            controller.setPickingColorFor((cur) =>
              cur === agent.participant_id ? null : agent.participant_id,
            );
          }}
        >
          <Palette size={12} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

function AgentColorPicker({
  view,
  controller,
}: RightAgentSummaryProps): JSX.Element {
  return (
    <div
      className="agent-color-picker"
      role="listbox"
      aria-label="Agent color"
    >
      {AGENT_COLORS.map((color) => {
        const selected = view.agentColor === color;
        return (
          <button
            key={color}
            type="button"
            role="option"
            aria-selected={selected}
            aria-label={`Color ${color}`}
            title={color}
            className={`agent-color-swatch picker${selected ? " selected" : ""}`}
            style={{ background: color }}
            disabled={view.isBusy}
            onClick={() => {
              void controller.recolorAgent(view.agent, color);
            }}
          >
            {selected ? <Check size={11} aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}
