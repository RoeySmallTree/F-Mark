import type { JSX } from "react";
import { AvatarArt } from "./AvatarArt.js";
import type { ParticipantAvatarViewState } from "./state.js";

export function ParticipantAvatarView({
  ariaHidden,
  artLines,
  artTones,
  classes,
  glyph,
  label,
  participantId,
  resolvedKind,
  style,
  title,
}: ParticipantAvatarViewState): JSX.Element {
  return (
    <span
      className={classes}
      title={title}
      style={style}
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : label}
      data-participant-avatar={participantId}
    >
      {artLines !== undefined ? (
        <span
          className="avatar-glyph"
          data-avatar-kind={resolvedKind}
          data-avatar-preset={glyph?.id}
          aria-hidden="true"
        >
          <AvatarArt lines={artLines} tones={artTones} />
        </span>
      ) : null}
    </span>
  );
}
