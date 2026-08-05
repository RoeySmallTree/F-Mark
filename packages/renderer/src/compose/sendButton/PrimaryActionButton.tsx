import type { JSX } from "react";
import { CornerDownLeft, ShieldAlert, Square } from "lucide-react";
import { ActionLabel } from "./ActionLabel.js";
import type { SendButtonKind } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  pending: "pending",
  stop: "stop",
  send: "send",
  postComment: "post-comment",
  endTurn: "end-turn",
} as const;

interface PrimaryActionButtonProps {
  ariaLabel: string;
  disabled: boolean;
  disabledReason: string | null;
  kind: SendButtonKind;
  pendingLabel: string;
  stopLabel: string;
  onClick(): void;
}

export function PrimaryActionButton({
  ariaLabel,
  disabled,
  disabledReason,
  kind,
  pendingLabel,
  stopLabel,
  onClick,
}: PrimaryActionButtonProps): JSX.Element {
  return (
    <div className="primary-action-wrap">
      <button
        type="button"
        className={`primary-action is-${kind}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        title={disabledReason ?? undefined}
        data-state={kind}
      >
        <ActionLabel active={kind === NO_LOOSE_STRING_VALUES.pending}>
          <ShieldAlert size={13} aria-hidden />
          <span>{pendingLabel}</span>
        </ActionLabel>
        <ActionLabel active={kind === NO_LOOSE_STRING_VALUES.stop}>
          <Square size={12} aria-hidden fill="currentColor" />
          <span>{stopLabel}</span>
        </ActionLabel>
        <ActionLabel active={kind === NO_LOOSE_STRING_VALUES.send}>
          <span>Send</span>
          <CornerDownLeft size={13} aria-hidden className="action-arrow" />
        </ActionLabel>
        <ActionLabel active={kind === NO_LOOSE_STRING_VALUES.postComment}>
          <span>Post comment</span>
        </ActionLabel>
        <ActionLabel active={kind === NO_LOOSE_STRING_VALUES.endTurn}>
          <span>End turn</span>
          <CornerDownLeft size={13} aria-hidden />
        </ActionLabel>
      </button>
    </div>
  );
}

