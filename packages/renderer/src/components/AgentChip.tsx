/* AgentChip — a compact identity chip for a managed agent. Renders three
   visual layers:

     1. Runtime icon keyed off runtimeId / participant name.
     2. Participant name.
     3. State dot + conditional badges:
          - `exited` pill when state === "pane-dead"
          - wrench glyph when state === "hook-not-installed"

   The dot's color is driven by a CSS class on `.agent-chip-dot`. See
   `chips.css` for the per-state colors that resolve through the theme
   tokens defined in tokens.css. */

import type { JSX, MouseEvent } from "react";
import type { PresenceState } from "@f-mark/shared";
import { avatarIconSrc, avatarKind } from "./ParticipantAvatar.js";
import "./chips.css";

export interface AgentChipProps {
  participantId: string;
  name: string;
  runtimeId: string | null;
  state: PresenceState;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
}

export function AgentChip({
  participantId,
  name,
  runtimeId,
  state,
  onClick,
}: AgentChipProps): JSX.Element {
  const interactive = onClick !== undefined;
  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      type={interactive ? "button" : undefined}
      className="agent-chip"
      data-participant-id={participantId}
      data-state={state}
      onClick={onClick}
      aria-label={`${name} — ${state}`}
    >
      <span className="agent-chip-runtime" aria-hidden>
        <img
          src={avatarIconSrc(
            avatarKind({ participantId, kind: "agent", name, runtimeId }),
          )}
          alt=""
          draggable={false}
        />
      </span>
      <span className="agent-chip-name">{name}</span>
      <span className={`agent-chip-dot ${state}`} aria-hidden />
      {state === "pane-dead" ? (
        <span className="agent-chip-pill" data-testid="agent-chip-exited">
          exited
        </span>
      ) : null}
      {state === "hook-not-installed" ? (
        <span
          className="agent-chip-wrench"
          data-testid="agent-chip-wrench"
          aria-label="Hook not installed"
          title="Hook not installed"
        >
          {"\u{1F527}"}
        </span>
      ) : null}
    </Tag>
  );
}
