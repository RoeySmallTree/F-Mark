import { useRef, type JSX } from "react";
import { Plus, X } from "lucide-react";
import { TabEmptyState } from "../TabEmptyState.js";
import { TerminalBodies } from "./TerminalBodies.js";
import { useRightTerminalController } from "./useRightTerminalController.js";
import { useRovingTabIndex } from "../../../a11y/useRovingTabIndex.js";

const NO_LOOSE_STRING_VALUES = {
  terminal: "terminal",
  terminalsUnavailable: "Terminals unavailable",
} as const;

/* Standalone, project-scoped terminals: the "Terminals" half of the dock pane.
   Inner tab per terminal, a `+` to spawn one, and a `×` to kill one. */
export function RegularTerminals(): JSX.Element {
  const c = useRightTerminalController();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    c.terminals.findIndex((t) => t.tmux_session === c.activeSession),
    0,
  );
  const { tabIndexFor, onKeyDown } = useRovingTabIndex(
    c.terminals.length,
    activeIndex,
    (index) => {
      const terminal = c.terminals[index];
      if (terminal === undefined) return;
      c.select(terminal.tmux_session);
      tabRefs.current[index]?.focus();
    },
  );

  if (c.terminals.length === 0) {
    return (
      <div className="terminal-empty" data-testid="terminal-regular-empty">
        {c.disabledReason !== null ? (
          <TabEmptyState
            variant={NO_LOOSE_STRING_VALUES.terminal}
            title={NO_LOOSE_STRING_VALUES.terminalsUnavailable}
            hint={c.disabledReason}
            fill
          />
        ) : (
          <TabEmptyState variant={NO_LOOSE_STRING_VALUES.terminal} fill>
            <button
              type="button"
              className="terminal-empty-new"
              onClick={c.spawn}
              disabled={c.spawnPending}
            >
              <Plus size={14} aria-hidden="true" /> New terminal
            </button>
            {c.error !== null && <p className="terminal-error">{c.error}</p>}
          </TabEmptyState>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className="terminal-tabs"
        role="tablist"
        aria-label="Terminals"
        onKeyDown={onKeyDown}
      >
        {c.terminals.map((t, index) => {
          const active = t.tmux_session === c.activeSession;
          return (
            <div
              key={t.tmux_session}
              className={`terminal-tab${active ? " active" : ""}`}
            >
              <button
                type="button"
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                role="tab"
                aria-selected={active}
                tabIndex={tabIndexFor(index)}
                className="terminal-tab-label"
                onClick={() => c.select(t.tmux_session)}
                title={t.tmux_session}
              >
                {t.label}
              </button>
              <button
                type="button"
                className="terminal-tab-close"
                aria-label={`Kill terminal ${t.label}`}
                title={`Kill terminal ${t.label}`}
                onClick={() => c.close(t.tmux_session)}
              >
                <X size={11} aria-hidden="true" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="terminal-tab-add"
          aria-label="New terminal"
          onClick={c.spawn}
          disabled={c.spawnPending}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>

      {c.error !== null && <p className="terminal-error">{c.error}</p>}

      <TerminalBodies
        sessions={c.terminals.map((t) => t.tmux_session)}
        active={c.activeSession}
        mountedSessions={c.mountedSessions}
        token={c.token}
      />
    </>
  );
}
