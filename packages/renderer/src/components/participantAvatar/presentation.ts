import type { CSSProperties } from "react";
import {
  resolveParticipantAvatarPreset,
  type AvatarPreset,
  type AvatarToneMap,
} from "@f-mark/shared";
import { agentKindArtLines, agentKindArtTones } from "./agentKindArt.js";
import type { AvatarKind, ParticipantAvatarInput } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  human: "human",
  avatar: "avatar",
  user: "user",
  agent: "agent",
  md: "md",
  active: "active",
  withGlyph: "with-glyph",
} as const;

export function avatarBorderColor(
  input: ParticipantAvatarInput,
): string | undefined {
  return input.color ?? input.participant?.color;
}

export function avatarGlyph(
  input: ParticipantAvatarInput,
  resolvedKind: AvatarKind,
): AvatarPreset | undefined {
  if (resolvedKind !== NO_LOOSE_STRING_VALUES.human) return undefined;
  const seed =
    input.participantId ??
    input.participant?.name ??
    input.name ??
    NO_LOOSE_STRING_VALUES.user;
  return resolveParticipantAvatarPreset(input.participant, seed);
}

export function avatarArtLines(
  glyph: AvatarPreset | undefined,
  resolvedKind: AvatarKind,
): readonly string[] | undefined {
  if (glyph !== undefined) {
    return glyph.lines;
  }
  return agentKindArtLines(resolvedKind);
}

export function avatarArtTones(
  glyph: AvatarPreset | undefined,
  resolvedKind: AvatarKind,
): AvatarToneMap | undefined {
  if (glyph !== undefined) {
    return glyph.tones;
  }
  return agentKindArtTones(resolvedKind);
}

export function avatarClasses(options: {
  active: boolean;
  className?: string;
  artLines?: readonly string[];
  resolvedKind: AvatarKind;
  size: "sm" | "md" | "lg" | "xl";
}): string {
  return [
    NO_LOOSE_STRING_VALUES.avatar,
    options.resolvedKind === NO_LOOSE_STRING_VALUES.human
      ? NO_LOOSE_STRING_VALUES.user
      : NO_LOOSE_STRING_VALUES.agent,
    options.size !== NO_LOOSE_STRING_VALUES.md ? options.size : "",
    options.active ? NO_LOOSE_STRING_VALUES.active : "",
    options.artLines !== undefined ? NO_LOOSE_STRING_VALUES.withGlyph : "",
    options.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function avatarColorStyle(
  color: string | undefined,
  artLines?: readonly string[],
): CSSProperties | undefined {
  if (artLines !== undefined || color !== undefined) {
    return {
      ...(color !== undefined ? { "--avatar-color": color } : {}),
    } as CSSProperties;
  }
  return undefined;
}

export function avatarLabel(
  input: ParticipantAvatarInput & {
    resolvedKind: AvatarKind;
    title?: string;
  },
): string {
  return (
    input.title ??
    input.name ??
    input.participant?.name ??
    input.participantId ??
    input.resolvedKind
  );
}
