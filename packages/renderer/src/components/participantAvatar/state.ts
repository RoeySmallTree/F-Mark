import type { CSSProperties } from "react";
import type { AvatarPreset, AvatarToneMap, Participant } from "@f-mark/shared";
import { useStore } from "../../state/store.js";
import { avatarKind } from "./kind.js";
import {
  avatarArtLines,
  avatarArtTones,
  avatarBorderColor,
  avatarClasses,
  avatarColorStyle,
  avatarGlyph,
  avatarLabel,
} from "./presentation.js";
import type { AvatarKind, ParticipantAvatarProps } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  md: "md",
  human: "human",
  user: "user",
  us: "us",
} as const;

export interface ParticipantAvatarViewState {
  ariaHidden: boolean;
  artLines?: readonly string[];
  artTones?: AvatarToneMap;
  classes: string;
  glyph?: AvatarPreset;
  label: string;
  resolvedKind: AvatarKind;
  style?: CSSProperties;
  title?: string;
}

export function useParticipantAvatarState(
  props: ParticipantAvatarProps,
): ParticipantAvatarViewState {
  const {
    participantId,
    participant,
    kind,
    name,
    color,
    runtimeId,
    size = NO_LOOSE_STRING_VALUES.md,
    className,
    title,
    active = false,
    ariaHidden = true,
  } = props;
  const avatarInput = { participantId, participant, kind, name, color, runtimeId };
  const resolvedKind = avatarKind(avatarInput);
  const storePreset = useStore((s) =>
    resolvedKind === NO_LOOSE_STRING_VALUES.human &&
    participantId !== undefined &&
    participantId.length > 0
      ? s.participants[participantId]?.avatar_preset
      : undefined,
  );
  const mergedParticipant: Participant | undefined =
    participant !== undefined
      ? {
          ...participant,
          ...(storePreset !== undefined && participant.avatar_preset === undefined
            ? { avatar_preset: storePreset }
            : {}),
        }
      : storePreset !== undefined && name !== undefined && color !== undefined
        ? {
            kind: NO_LOOSE_STRING_VALUES.user,
            name,
            color,
            avatar_preset: storePreset,
          }
        : undefined;
  const glyph = avatarGlyph(
    { ...avatarInput, participant: mergedParticipant },
    resolvedKind,
  );
  const artLines = avatarArtLines(glyph, resolvedKind);
  const artTones = avatarArtTones(glyph, resolvedKind);

  return {
    ariaHidden,
    artLines,
    artTones,
    classes: avatarClasses({
      active,
      className,
      artLines,
      resolvedKind,
      size,
    }),
    glyph,
    label: avatarLabel({ ...avatarInput, resolvedKind, title }),
    resolvedKind,
    style: avatarColorStyle(avatarBorderColor(avatarInput), artLines),
    title,
  };
}
