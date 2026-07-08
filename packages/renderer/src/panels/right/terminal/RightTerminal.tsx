import { type JSX } from "react";
import "./terminal.css";
import {
  setTerminalPaneMode,
  useTerminalPaneMode,
} from "../../../state/terminalPaneState.js";
import { AgentTerminals } from "./AgentTerminals.js";
import { RegularTerminals } from "./RegularTerminals.js";

const NO_LOOSE_STRING_VALUES = {
  terminals: "terminals",
  agents: "agents",
} as const;

/* The Terminal dock pane. A two-way toggle picks the source: standalone
   project terminals ("Terminals") or one live terminal per managed agent
   ("Agents"). The agent "open terminal" affordances flip this to Agents mode
   and focus a specific agent (see state/terminalPaneState.ts). */
export function RightTerminal(): JSX.Element {
  const mode = useTerminalPaneMode();

  return (
    <div className="right-terminal" data-testid="right-terminal">
      <div
        className="terminal-mode-toggle"
        role="tablist"
        aria-label="Terminal source"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "terminals"}
          className={`terminal-mode-btn${mode === "terminals" ? " active" : ""}`}
          onClick={() => setTerminalPaneMode(NO_LOOSE_STRING_VALUES.terminals)}
        >
          Terminals
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "agents"}
          className={`terminal-mode-btn${mode === "agents" ? " active" : ""}`}
          onClick={() => setTerminalPaneMode(NO_LOOSE_STRING_VALUES.agents)}
        >
          Agents
        </button>
      </div>

      {mode === NO_LOOSE_STRING_VALUES.terminals ? <RegularTerminals /> : <AgentTerminals />}
    </div>
  );
}
