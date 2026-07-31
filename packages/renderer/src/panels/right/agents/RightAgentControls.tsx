import {
  Eraser,
  Pause,
  Play,
  PlugZap,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
  Zap,
} from "lucide-react";
import { openAgentTerminalPane } from "../../../state/terminalPaneState.js";
import { useConfirmDestructive } from "../../../confirm/index.js";
import {
  commandTitle,
  type RightAgentViewModel,
} from "./agentPresentation.js";
import type {
  RightAgentsController,
  TerminalOverlayController,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  running: "running",
  notified: "notified",
  accessPending: "access-pending",
  connected: "connected",
  noPane: "no-pane",
  removed: "removed",
  resume: "Resume",
  pause: "Pause",
} as const;

interface RightAgentControlsProps {
  view: RightAgentViewModel;
  controller: RightAgentsController;
  modalCtx: TerminalOverlayController | null;
}

export function RightAgentControls({
  view,
  controller,
}: RightAgentControlsProps): JSX.Element {
  const { agent } = view;
  const confirmDestructive = useConfirmDestructive();
  const onClear = async (): Promise<void> => {
    const intent = await confirmDestructive({
      action: "agent.clear",
      title: `Clear ${agent.display_name}?`,
      detail: "Discards the agent's conversation context.",
    });
    if (intent === null) return;
    void controller.clear(agent);
  };
  const onGoodbye = async (): Promise<void> => {
    const intent = await confirmDestructive({
      action: "agent.goodbye",
      title: `Remove ${agent.display_name}?`,
      detail: "Ends the agent and its terminal session. This cannot be undone.",
    });
    if (intent === null) return;
    void controller.goodbye(agent, intent);
  };
  if (agent.membership_state === NO_LOOSE_STRING_VALUES.removed) {
    return (
      <div className="agent-controls">
        <button
          type="button"
          title="Refresh"
          aria-label="Refresh agents"
          disabled={controller.loading}
          onClick={() => void controller.refresh()}
        >
          <RotateCcw size={13} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>
    );
  }
  const working =
    agent.activity_state === NO_LOOSE_STRING_VALUES.running ||
    agent.activity_state === NO_LOOSE_STRING_VALUES.notified ||
    agent.activity_state === NO_LOOSE_STRING_VALUES.accessPending;
  const disconnected = agent.connection_state !== NO_LOOSE_STRING_VALUES.connected;
  return (
    <div className="agent-controls">
      {working ? (
        <button
          type="button"
          className="agent-control-primary danger"
          title="Stop"
          aria-label={`Stop ${agent.display_name}`}
          disabled={view.isBusy || disconnected || !agent.controllable}
          onClick={() => void controller.interrupt(agent)}
        >
          <Square size={13} aria-hidden="true" />
          <span>Stop</span>
        </button>
      ) : disconnected ? (
        <button
          type="button"
          className="agent-control-primary"
          title="Reconnect"
          aria-label={`Reconnect ${agent.display_name}`}
          disabled={
            view.isBusy || agent.pane_lifecycle === NO_LOOSE_STRING_VALUES.noPane
          }
          onClick={() => void controller.reconnect(agent)}
        >
          <PlugZap size={14} aria-hidden="true" />
          <span>Reconnect</span>
        </button>
      ) : (
        <button
          type="button"
          className="agent-control-primary"
          title={agent.paused ? "Resume" : "Pause"}
          aria-label={`${agent.paused ? "Resume" : "Pause"} ${agent.display_name}`}
          disabled={view.isBusy || !agent.controllable}
          onClick={() => void controller.pauseOrResume(agent)}
        >
          {agent.paused ? (
            <Play size={14} aria-hidden="true" />
          ) : (
            <Pause size={14} aria-hidden="true" />
          )}
          <span>{agent.paused ? NO_LOOSE_STRING_VALUES.resume : NO_LOOSE_STRING_VALUES.pause}</span>
        </button>
      )}
      <button
        type="button"
        title={commandTitle("Compact", view.commandReason)}
        aria-label={`Compact ${agent.display_name}`}
        disabled={view.isBusy || view.compactDisabled}
        onClick={() => void controller.compact(agent)}
      >
        <Zap size={13} aria-hidden="true" />
        <span>Compact</span>
      </button>
      <button
        type="button"
        title={commandTitle("Clear", view.commandReason)}
        aria-label={`Clear ${agent.display_name}`}
        disabled={view.isBusy || view.clearDisabled}
        onClick={() => void onClear()}
      >
        <Eraser size={13} aria-hidden="true" />
        <span>Clear</span>
      </button>
      <button
        type="button"
        title="Open terminal"
        aria-label={`Open ${agent.display_name} terminal`}
        disabled={!view.canOpenTerminal}
        onClick={() => {
          if (agent.tmux_session !== null) {
            openAgentTerminalPane(agent.tmux_session);
          }
        }}
      >
        <Terminal size={13} aria-hidden="true" />
        <span>Terminal</span>
      </button>
      <button
        type="button"
        title="Refresh"
        aria-label="Refresh agents"
        disabled={controller.loading}
        onClick={() => void controller.refresh()}
      >
        <RotateCcw size={13} aria-hidden="true" />
        <span>Refresh</span>
      </button>
      <button
        type="button"
        title="Goodbye"
        aria-label={`Goodbye ${agent.display_name}`}
        disabled={view.isBusy}
        onClick={() => void onGoodbye()}
      >
        <Trash2 size={13} aria-hidden="true" />
        <span>Remove</span>
      </button>
    </div>
  );
}
