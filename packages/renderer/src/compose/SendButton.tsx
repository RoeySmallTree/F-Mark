/* PrimaryAction — the single morphing action button on the right side of
   the compose stage. Replaces the prior Send | End-turn cluster.

   One slot, four labels. The slot never grows or shrinks: all four labels
   live in the same grid cell, sized to the longest, and crossfade between
   each other on state change. No layout shifts.

   State derivation (priority order):
     - Agent's turn (any agent online/stale + currentTurn === "ag")
         → "Stop run"  · click = onInterrupt
     - mode === "comment"
         → "Post comment"  · click = onSubmit  · disabled if !canSubmit
     - mode === "message" && hasContent
         → "Send"  · click = onSubmit  · disabled if !canSubmit
     - mode === "named"
         → "End turn"  · click = onSubmit  · disabled if !canSubmit
     - otherwise (mode === "message" empty)
         → "End turn"  · click = onEndTurn  · always enabled when not busy

   The "Stop run" state recolors the button to the agent palette so the
   user immediately recognizes it's no longer the same action — a quiet
   amber tint, not a loud red alarm. F-Mark stays calm even when
   interrupting. */

import { type JSX } from "react";
import { CornerDownLeft, Square } from "lucide-react";

type Kind = "stop" | "send" | "post-comment" | "end-turn";

interface Props {
  mode: "message" | "named" | "comment";
  canSubmit: boolean;
  busy: boolean;
  hasContent: boolean;
  isAgentTurn: boolean;
  onSubmit(): void;
  onEndTurn(): void;
  onInterrupt(): void;
}

function deriveKind(
  mode: Props["mode"],
  hasContent: boolean,
  isAgentTurn: boolean,
): Kind {
  if (isAgentTurn) return "stop";
  if (mode === "comment") return "post-comment";
  if (mode === "message" && hasContent) return "send";
  if (mode === "named") return "end-turn";
  return "end-turn";
}

export function SendButton({
  mode,
  canSubmit,
  busy,
  hasContent,
  isAgentTurn,
  onSubmit,
  onEndTurn,
  onInterrupt,
}: Props): JSX.Element {
  const kind = deriveKind(mode, hasContent, isAgentTurn);

  /* Disabled per kind. Stop is always clickable while agent is running.
     End-turn is clickable unless we're mid-request. The submit kinds
     (send / post-comment / named end-turn) gate on canSubmit. */
  const disabled =
    kind === "stop"
      ? false
      : kind === "end-turn" && mode === "message"
        ? busy
        : busy || !canSubmit;

  const ariaLabel =
    kind === "stop"
      ? "Stop run — interrupt all agents"
      : kind === "send"
        ? "Send message"
        : kind === "post-comment"
          ? "Post comment"
          : mode === "named"
            ? "End turn with named contribution"
            : "End turn";

  function handleClick(): void {
    if (kind === "stop") return onInterrupt();
    if (kind === "send" || kind === "post-comment") return onSubmit();
    if (mode === "named") return onSubmit();
    return onEndTurn();
  }

  return (
    <button
      type="button"
      className={`primary-action is-${kind}`}
      onClick={handleClick}
      disabled={disabled}
      aria-label={ariaLabel}
      data-state={kind}
    >
      <Label active={kind === "stop"}>
        <Square size={12} aria-hidden fill="currentColor" />
        <span>Stop run</span>
      </Label>
      <Label active={kind === "send"}>
        <span>Send</span>
        <CornerDownLeft size={13} aria-hidden className="action-arrow" />
      </Label>
      <Label active={kind === "post-comment"}>
        <span>Post comment</span>
      </Label>
      <Label active={kind === "end-turn"}>
        <span>End turn</span>
        <CornerDownLeft size={13} aria-hidden />
      </Label>
    </button>
  );
}

function Label({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <span
      className={`primary-action__label${active ? " is-active" : ""}`}
      aria-hidden={!active}
    >
      {children}
    </span>
  );
}
