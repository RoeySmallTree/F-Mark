import { useState, type CSSProperties, type JSX } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eraser,
  LogOut,
  Palette,
  Pause,
  Pencil,
  Play,
  PlugZap,
  RotateCcw,
  Square,
  Terminal,
  Zap,
} from "lucide-react";
import { runtimeAccessModeLabel } from "@f-mark/shared";
import { openAgentTerminalPane } from "../../../state/terminalPaneState.js";
import { Popover } from "../../../popovers/Popover.js";
import { usePopoverExit } from "../../../popovers/usePopoverExit.js";
import {
  commandTitle,
  contextFallback,
  effortLabel,
  modelLabel,
  type RightAgentViewModel,
} from "./agentPresentation.js";
import type { RightAgentsController } from "./types.js";
import "./agent-popover.css";

const AGENT_POPOVER_VALUES = {
  accessPending: "access-pending",
  connected: "connected",
  noPane: "no-pane",
  notified: "notified",
  pause: "Pause",
  paused: "Paused",
  removed: "removed",
  removedLabel: "Removed",
  resume: "Resume",
  running: "running",
  toneAgent: "tone-agent",
  toneDanger: "tone-danger",
  toneGreen: "tone-green",
  toneMuted: "tone-muted",
  loadingRuntimeControls: "Loading runtime controls",
} as const;

interface AgentPopoverProps {
  view: RightAgentViewModel;
  controller: RightAgentsController;
  anchorRect: DOMRect;
  onClose(): void;
}

export function AgentPopover({
  view,
  controller,
  anchorRect,
  onClose,
}: AgentPopoverProps): JSX.Element {
  const { agent } = view;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { closing, requestClose } = usePopoverExit(onClose);

  const options = controller.runtimeOptions[agent.participant_id];
  const optionsLoading =
    controller.runtimeOptionsLoading[agent.participant_id] === true &&
    options === undefined;
  const modelValue =
    agent.runtime_state?.configuredModel ?? agent.runtime_state?.model ?? "";
  const effortValue =
    agent.runtime_state?.configuredEffort ?? agent.runtime_state?.effort ?? "";
  const modelOptions = options?.models ?? [];
  const effortOptions = options?.efforts ?? [];

  const working =
    agent.activity_state === AGENT_POPOVER_VALUES.running ||
    agent.activity_state === AGENT_POPOVER_VALUES.notified ||
    agent.activity_state === AGENT_POPOVER_VALUES.accessPending;
  const disconnected =
    agent.connection_state !== AGENT_POPOVER_VALUES.connected;
  const isRemoved = agent.membership_state === AGENT_POPOVER_VALUES.removed;
  const canChangePermissions = agent.access.supported_modes.length > 0;

  function toneCls(): string {
    if (isRemoved || agent.paused || disconnected)
      return AGENT_POPOVER_VALUES.toneMuted;
    if (
      agent.activity_state === AGENT_POPOVER_VALUES.running ||
      agent.activity_state === AGENT_POPOVER_VALUES.notified
    )
      return AGENT_POPOVER_VALUES.toneAgent;
    if (agent.activity_state === AGENT_POPOVER_VALUES.accessPending)
      return AGENT_POPOVER_VALUES.toneDanger;
    return AGENT_POPOVER_VALUES.toneGreen;
  }

  function statusText(): string {
    if (isRemoved) return AGENT_POPOVER_VALUES.removedLabel;
    if (agent.paused) return AGENT_POPOVER_VALUES.paused;
    if (disconnected) return agent.connection_state.replace(/-/g, " ");
    return agent.activity_state.replace(/-/g, " ");
  }

  return (
    <Popover
      anchorRect={anchorRect}
      placement="bottom-start"
      onClose={requestClose}
      closing={closing}
      className="agent-pop"
      ariaLabel={`${agent.display_name} controls`}
    >
      <div
        className="agp-root"
        style={
          view.agentColor !== null
            ? ({ "--agent-color": view.agentColor } as CSSProperties)
            : undefined
        }
      >
        {/* Ambient glow that picks up the agent's color */}
        <div className="agp-glow" aria-hidden="true" />

        {/* ── Header ──────────────────────────────────────────── */}
        <header className="agp-head">
          <div
            className="agp-avatar"
            aria-hidden="true"
            style={
              view.agentColor !== null ? { background: view.agentColor } : undefined
            }
          >
            {agent.display_name.charAt(0).toUpperCase()}
          </div>

          <div className="agp-head-copy">
            <div className="agp-name-row">
              <strong>{agent.display_name}</strong>
              <button
                type="button"
                className="agp-icon-btn"
                title="Rename"
                aria-label={`Rename ${agent.display_name}`}
                onClick={() => {
                  controller.setEditing({
                    id: agent.participant_id,
                    value: agent.display_name,
                  });
                  requestClose();
                }}
              >
                <Pencil size={11} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="agp-icon-btn"
                title="Pick color"
                aria-label={`Pick color for ${agent.display_name}`}
                onClick={() => {
                  controller.setPickingColorFor(agent.participant_id);
                  requestClose();
                }}
              >
                <Palette size={11} aria-hidden="true" />
              </button>
            </div>
            <span className={`agp-status-text ${toneCls()}`}>{statusText()}</span>
          </div>

          <span className={`agp-status-dot ${toneCls()}`} aria-hidden="true" />
        </header>

        {/* ── Runtime: model + effort ──────────────────────────── */}
        {!isRemoved ? (
          <section className="agp-section">
            <div className="agp-section-label">Runtime</div>
            {optionsLoading ? (
              <div
                className="agp-skeleton-grid"
                aria-label={AGENT_POPOVER_VALUES.loadingRuntimeControls}
              >
                <span className="agp-skeleton agp-skeleton-wide" />
                <span className="agp-skeleton" />
                <span className="agp-skeleton" />
              </div>
            ) : (
              <div className="agp-field-grid">
                <label className="agp-field">
                  <span>Model</span>
                  <select
                    value={modelValue}
                    disabled={view.isBusy}
                    onChange={(e) =>
                      void controller.setRuntimeModel(agent, e.currentTarget.value)
                    }
                  >
                    {modelValue === "" ? (
                      <option value="">Provider default</option>
                    ) : modelOptions.every((m) => m.id !== modelValue) ? (
                      <option value={modelValue}>{modelLabel(agent)}</option>
                    ) : null}
                    {modelOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="agp-field">
                  <span>Effort</span>
                  <select
                    value={effortValue}
                    disabled={view.isBusy}
                    onChange={(e) =>
                      void controller.setRuntimeEffort(agent, e.currentTarget.value)
                    }
                  >
                    {effortValue === "" ? (
                      <option value="">Provider default</option>
                    ) : effortOptions.every((eff) => eff.id !== effortValue) ? (
                      <option value={effortValue}>{effortLabel(agent)}</option>
                    ) : null}
                    {effortOptions.map((eff) => (
                      <option key={eff.id} value={eff.id}>
                        {eff.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </section>
        ) : null}

        {/* ── Permissions ─────────────────────────────────────── */}
        {!isRemoved ? (
          <section className="agp-section">
            <div className="agp-section-label">Permissions</div>
            {canChangePermissions ? (
              <label className="agp-field">
                <span>Mode</span>
                <select
                  value={agent.access.mode}
                  disabled={view.isBusy}
                  title={agent.access.reason}
                  onChange={(e) =>
                    void controller.setAccessMode(agent, e.currentTarget.value)
                  }
                >
                  {agent.access.supported_modes.map((mode) => (
                    <option key={mode} value={mode}>
                      {runtimeAccessModeLabel(agent.runtime_id, mode)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="agp-readonly-value">
                {runtimeAccessModeLabel(agent.runtime_id, agent.access.mode)}
              </div>
            )}
            {agent.access.reason !== undefined ? (
              <p className="agp-section-note">{agent.access.reason}</p>
            ) : null}
          </section>
        ) : null}

        {/* ── Context note ────────────────────────────────────── */}
        {!isRemoved ? (
          <section className="agp-section">
            <div className="agp-section-label">Context</div>
            <p className="agp-section-note">{contextFallback(agent)}</p>
          </section>
        ) : null}

        {/* ── Quick action tiles ──────────────────────────────── */}
        <section className="agp-section">
          <div className="agp-section-label">Actions</div>
          <div className="agp-tile-grid">
            {/* Primary action changes based on state */}
            {isRemoved ? (
              <button
                type="button"
                className="agp-tile"
                disabled={controller.loading}
                onClick={() => {
                  void controller.refresh();
                  requestClose();
                }}
              >
                <RotateCcw size={14} aria-hidden="true" />
                <span>Refresh</span>
              </button>
            ) : working ? (
              <button
                type="button"
                className="agp-tile agp-tile-danger"
                disabled={view.isBusy || disconnected || !agent.controllable}
                onClick={() => {
                  void controller.interrupt(agent);
                  requestClose();
                }}
              >
                <Square size={14} aria-hidden="true" />
                <span>Stop</span>
              </button>
            ) : disconnected ? (
              <button
                type="button"
                className="agp-tile agp-tile-accent"
                disabled={
                  view.isBusy ||
                  agent.pane_lifecycle === AGENT_POPOVER_VALUES.noPane
                }
                onClick={() => {
                  void controller.reconnect(agent);
                  requestClose();
                }}
              >
                <PlugZap size={14} aria-hidden="true" />
                <span>Reconnect</span>
              </button>
            ) : (
              <button
                type="button"
                className="agp-tile"
                disabled={view.isBusy || !agent.controllable}
                onClick={() => {
                  void controller.pauseOrResume(agent);
                  requestClose();
                }}
              >
                {agent.paused ? (
                  <Play size={14} aria-hidden="true" />
                ) : (
                  <Pause size={14} aria-hidden="true" />
                )}
                <span>
                  {agent.paused
                    ? AGENT_POPOVER_VALUES.resume
                    : AGENT_POPOVER_VALUES.pause}
                </span>
              </button>
            )}

            <button
              type="button"
              className="agp-tile"
              disabled={view.isBusy || view.compactDisabled}
              title={commandTitle("Compact", view.commandReason)}
              onClick={() => {
                void controller.compact(agent);
                requestClose();
              }}
            >
              <Zap size={14} aria-hidden="true" />
              <span>Compact</span>
            </button>

            <button
              type="button"
              className="agp-tile"
              disabled={!view.canOpenTerminal}
              onClick={() => {
                if (agent.tmux_session !== null) {
                  openAgentTerminalPane(agent.tmux_session);
                }
                requestClose();
              }}
            >
              <Terminal size={14} aria-hidden="true" />
              <span>Terminal</span>
            </button>

            <button
              type="button"
              className="agp-tile"
              disabled={controller.loading}
              onClick={() => void controller.refresh()}
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>Refresh</span>
            </button>
          </div>
        </section>

        {/* ── Advanced (collapsible) ───────────────────────────── */}
        {!isRemoved ? (
          <section className="agp-section agp-section-last">
            <button
              type="button"
              className="agp-collapse-trigger"
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              <span>Advanced</span>
              {advancedOpen ? (
                <ChevronUp size={13} aria-hidden="true" />
              ) : (
                <ChevronDown size={13} aria-hidden="true" />
              )}
            </button>
            {advancedOpen ? (
              <div className="agp-collapse-body">
                <button
                  type="button"
                  className="agp-row-action"
                  disabled={view.isBusy || view.clearDisabled}
                  title={commandTitle("Clear", view.commandReason)}
                  onClick={() => {
                    if (!window.confirm(`Clear ${agent.display_name}?`)) return;
                    void controller.clear(agent);
                    requestClose();
                  }}
                >
                  <Eraser size={13} aria-hidden="true" />
                  Clear context
                </button>
                <button
                  type="button"
                  className="agp-row-action agp-row-action-danger"
                  disabled={view.isBusy}
                  onClick={() => {
                    if (!window.confirm(`Remove ${agent.display_name}?`)) return;
                    void controller.goodbye(agent);
                    requestClose();
                  }}
                >
                  <LogOut size={13} aria-hidden="true" />
                  Say goodbye
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </Popover>
  );
}
