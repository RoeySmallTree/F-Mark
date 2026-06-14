/* TerminalChip — visualizes one managed terminal pane in the top bar.
   Mirrors the AgentChip's pill shape but uses the terminal bitmap as the
   leading icon and accepts a free-form label.

   Clicking the chip is delegated upward via onClick — the parent owns
   the menu that opens (separate component, not in scope for v0.4 here). */

import type { JSX } from "react";
import { iconMaskStyle } from "./ParticipantAvatar.js";
import "./chips.css";

export interface TerminalChipProps {
  tmuxSession: string;
  label: string;
  onClick?: () => void;
}

export function TerminalChip({
  tmuxSession,
  label,
  onClick,
}: TerminalChipProps): JSX.Element {
  const interactive = onClick !== undefined;
  const Tag = interactive ? "button" : "div";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      className="terminal-chip"
      data-tmux-session={tmuxSession}
      onClick={onClick}
      aria-label={`Terminal ${label}`}
    >
      <span className="terminal-chip-icon" aria-hidden>
        <span className="icon-mask" style={iconMaskStyle("terminal")} />
      </span>
      <span className="terminal-chip-label">{label}</span>
    </Tag>
  );
}
