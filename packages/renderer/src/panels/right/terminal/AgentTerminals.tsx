import { type JSX } from "react";
import { X } from "lucide-react";
import { TabEmptyState } from "../TabEmptyState.js";
import { TerminalBodies } from "./TerminalBodies.js";
import { useAgentTerminalsController } from "./useAgentTerminalsController.js";

const NO_LOOSE_STRING_VALUES = {
  terminalAgents: "terminal-agents",
  terminalAgentsLive: "terminal-agents-live",
} as const;

/* The "Agents" half of the dock pane: one inner tab per managed agent, each
   showing that agent's live tmux terminal. No spawn/close — agents are created
   and ended through the agent lifecycle, not here. */
export function AgentTerminals(): JSX.Element {
  const c = useAgentTerminalsController();
  const activeAgent =
    c.active !== null
      ? c.agents.find((agent) => agent.tmux_session === c.active)
      : undefined;

  if (c.agents.length === 0) {
    return (
      <div className="terminal-empty" data-testid="terminal-agents-empty">
        <TabEmptyState
          variant={
            c.hasSessionAgents
              ? NO_LOOSE_STRING_VALUES.terminalAgentsLive
              : NO_LOOSE_STRING_VALUES.terminalAgents
          }
          fill
        />
      </div>
    );
  }

  return (
    <>
      <div className="terminal-tabs" role="tablist" aria-label="Agent terminals">
        {c.agents.map((a) => {
          const active = a.tmux_session === c.active;
          return (
            <div
              key={a.tmux_session}
              className={`terminal-tab${active ? " active" : ""}`}
              role="tab"
              aria-selected={active}
            >
              <button
                type="button"
                className="terminal-tab-label"
                onClick={() => c.select(a.tmux_session)}
                title={a.alive ? a.tmux_session : "Agent terminal is detached"}
              >
                {a.label}
              </button>
              <button
                type="button"
                className="terminal-tab-close"
                aria-label={`Close agent ${a.label}`}
                disabled={c.closing.has(a.participant_id)}
                onClick={() => c.close(a)}
              >
                <X size={11} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      {c.error !== null ? <p className="terminal-error">{c.error}</p> : null}

      {activeAgent !== undefined && !activeAgent.alive ? (
        <div className="terminal-agent-unavailable">
          <p>{activeAgent.label} is detached.</p>
          <button type="button" onClick={() => c.close(activeAgent)}>
            Remove agent
          </button>
        </div>
      ) : (
        <TerminalBodies
          sessions={c.agents.filter((a) => a.alive).map((a) => a.tmux_session)}
          active={c.active}
          mountedSessions={c.mountedSessions}
          token={c.token}
        />
      )}
    </>
  );
}
