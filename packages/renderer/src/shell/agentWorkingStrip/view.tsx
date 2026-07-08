import type { JSX, Ref } from "react";
import { ParticipantAvatar } from "../../components/ParticipantAvatar.js";
import { fmtClock } from "./timing.js";
import type { AgentWorkingStripViewProps } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
  xl: "xl",
} as const;

export function AgentWorkingStripView({
  actionText,
  ariaLabel,
  art,
  artRef,
  blocked,
  elapsedSec,
  firstId,
  firstParticipant,
  greenClass,
  label,
  stateClass,
}: AgentWorkingStripViewProps): JSX.Element {
  return (
    <div
      className={`awb awb-pulse${greenClass} ${stateClass}`}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <span className="awb-orb" aria-hidden="true">
        <span className="ring" />
        <span className="ring" />
        <span className="ring" />
        <ParticipantAvatar
          participantId={firstId}
          participant={firstParticipant}
          kind={firstParticipant?.kind ?? NO_LOOSE_STRING_VALUES.agent}
          name={firstParticipant === undefined ? label : undefined}
          color={firstParticipant?.color}
          runtimeId={firstParticipant?.runtime_id}
          size={NO_LOOSE_STRING_VALUES.xl}
          className="awb-avatar"
        />
      </span>

      <span className="awb-name">{label}</span>

      <span
        className="awb-art"
        aria-hidden="true"
        ref={artRef as Ref<HTMLSpanElement>}
      >
        <pre>{art}</pre>
      </span>

      <span className="awb-side">
        <span className="awb-action">
          {actionText}
          {!blocked && (
            <span className="awb-ell" aria-hidden="true">
              <i>.</i>
              <i>.</i>
              <i>.</i>
            </span>
          )}
        </span>
        {elapsedSec !== null && (
          <span className="awb-clock">
            {fmtClock(elapsedSec)}
            <small>ELAPSED</small>
          </span>
        )}
      </span>
    </div>
  );
}
