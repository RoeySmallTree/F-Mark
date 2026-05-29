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

import type { CSSProperties, JSX, MouseEvent } from "react";
import type { CurrentRuntimeState, PresenceState } from "@f-mark/shared";
import { avatarKind, iconMaskStyle } from "./ParticipantAvatar.js";
import "./chips.css";

export interface AgentChipProps {
  participantId: string;
  name: string;
  runtimeId: string | null;
  state: PresenceState;
  color?: string | null;
  active?: boolean;
  accessPending?: boolean;
  pendingAccessCount?: number;
  runtimeState?: CurrentRuntimeState;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  onModelBadgeClick?: (event: MouseEvent<HTMLElement>) => void;
}

function shortenModel(id: string): string {
  // claude-opus-4-7 → Opus 4.7; claude-sonnet-4-6 → Sonnet 4.6
  const claudeMatch = id.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/i);
  if (claudeMatch) {
    const [, fam, maj, min] = claudeMatch;
    return `${fam!.charAt(0).toUpperCase()}${fam!.slice(1)} ${maj}.${min}`;
  }
  // provider/model → model
  if (id.includes("/")) return id.split("/").pop() ?? id;
  return id;
}

export function AgentChip({
  participantId,
  name,
  runtimeId,
  state,
  color,
  active = false,
  accessPending = false,
  pendingAccessCount = 0,
  runtimeState,
  onClick,
  onModelBadgeClick,
}: AgentChipProps): JSX.Element {
  const interactive = onClick !== undefined;
  const Tag = interactive ? "button" : "div";
  const style: CSSProperties | undefined =
    typeof color === "string" && color.length > 0
      ? ({ "--agent-color": color } as CSSProperties)
      : undefined;

  return (
    <Tag
      type={interactive ? "button" : undefined}
      className={`agent-chip${active ? " active" : ""}`}
      data-participant-id={participantId}
      data-state={accessPending ? "access-pending" : state}
      onClick={onClick}
      aria-label={`${name} — ${accessPending ? "access pending" : state}`}
      style={style}
    >
      <span className="agent-chip-runtime" aria-hidden>
        <span
          className="icon-mask"
          style={iconMaskStyle(
            avatarKind({ participantId, kind: "agent", name, runtimeId }),
          )}
        />
      </span>
      <span className="agent-chip-name">{name}</span>
      <span
        className={`agent-chip-dot ${accessPending ? "access-pending" : state}`}
        aria-hidden
      />
      {runtimeState?.model || runtimeState?.configuredModel ? (
        <span
          className={
            onModelBadgeClick
              ? "agent-chip-model interactive"
              : "agent-chip-model"
          }
          data-testid="agent-chip-model"
          onClick={
            onModelBadgeClick
              ? (e) => {
                  e.stopPropagation();
                  onModelBadgeClick(e);
                }
              : undefined
          }
          role={onModelBadgeClick ? "button" : undefined}
          title={
            runtimeState.source === "override"
              ? "Configured override (not yet observed live)"
              : runtimeState.source === "transcript" ||
                  runtimeState.source === "rollout" ||
                  runtimeState.source === "opencode-db"
                ? `Live from ${runtimeState.source}`
                : runtimeState.source
          }
        >
          <span className="agent-chip-model-name">
            {shortenModel(
              runtimeState.model ?? runtimeState.configuredModel ?? "",
            )}
          </span>
          {runtimeState.effort || runtimeState.configuredEffort ? (
            <span className="agent-chip-model-effort">
              {runtimeState.effort ?? runtimeState.configuredEffort}
            </span>
          ) : null}
        </span>
      ) : null}
      {accessPending ? (
        <span className="agent-chip-access" title="Access pending">
          {pendingAccessCount > 1 ? pendingAccessCount : "!"}
        </span>
      ) : null}
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
