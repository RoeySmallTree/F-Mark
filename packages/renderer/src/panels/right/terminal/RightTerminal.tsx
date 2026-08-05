import { useRef, type JSX } from "react";
import "./terminal.css";
import {
  setTerminalPaneMode,
  useTerminalPaneMode,
} from "../../../state/terminalPaneState.js";
import { useRovingTabIndex } from "../../../a11y/useRovingTabIndex.js";
import { AgentTerminals } from "./AgentTerminals.js";
import { RegularTerminals } from "./RegularTerminals.js";

const NO_LOOSE_STRING_VALUES = {
  terminals: "terminals",
  agents: "agents",
} as const;

const TERMINAL_MODE_ORDER = [
  NO_LOOSE_STRING_VALUES.terminals,
  NO_LOOSE_STRING_VALUES.agents,
] as const;

/* The Terminal dock pane. A two-way toggle picks the source: standalone
   project terminals ("Terminals") or one live terminal per managed agent
   ("Agents"). The agent "open terminal" affordances flip this to Agents mode
   and focus a specific agent (see state/terminalPaneState.ts). */
export function RightTerminal(): JSX.Element {
  const mode = useTerminalPaneMode();
  const modeButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const modeIndex = TERMINAL_MODE_ORDER.indexOf(mode);
  const { tabIndexFor, onKeyDown } = useRovingTabIndex(
    TERMINAL_MODE_ORDER.length,
    modeIndex < 0 ? 0 : modeIndex,
    (index) => {
      const next = TERMINAL_MODE_ORDER[index];
      if (next === undefined) return;
      setTerminalPaneMode(next);
      modeButtonRefs.current[index]?.focus();
    },
  );

  return (
    <div className="right-terminal" data-testid="right-terminal">
      <div
        className="terminal-mode-toggle"
        role="tablist"
        aria-label="Terminal source"
        onKeyDown={onKeyDown}
      >
        <button
          type="button"
          ref={(el) => {
            modeButtonRefs.current[0] = el;
          }}
          role="tab"
          aria-selected={mode === "terminals"}
          tabIndex={tabIndexFor(0)}
          className={`terminal-mode-btn${mode === "terminals" ? " active" : ""}`}
          onClick={() => setTerminalPaneMode(NO_LOOSE_STRING_VALUES.terminals)}
        >
          Terminals
        </button>
        <button
          type="button"
          ref={(el) => {
            modeButtonRefs.current[1] = el;
          }}
          role="tab"
          aria-selected={mode === "agents"}
          tabIndex={tabIndexFor(1)}
          className={`terminal-mode-btn${mode === "agents" ? " active" : ""}`}
          onClick={() => setTerminalPaneMode(NO_LOOSE_STRING_VALUES.agents)}
        >
          Agents
        </button>
      </div>

      {mode === NO_LOOSE_STRING_VALUES.terminals ? (
        <RegularTerminals />
      ) : (
        <AgentTerminals />
      )}
    </div>
  );
}
