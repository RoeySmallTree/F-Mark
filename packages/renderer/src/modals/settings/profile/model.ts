import type { Participant, UserProfile } from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  user: "user",
} as const;

export const PRESET_COLORS = [
  "#2a5fa8",
  "#3d7a4f",
  "#b86a1f",
  "#8a2a8a",
  "#a83a3a",
  "#1a1714",
  "#5b9dff",
  "#cb4b16",
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const DEFAULT_PROFILE: UserProfile = { name: "You", color: "#3b82f6" };

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

export function profileFromParticipant(
  participant: Participant | undefined,
): UserProfile | null {
  if (participant === undefined) return null;
  return {
    name: participant.name,
    color: participant.color,
    ...(participant.avatar_preset !== undefined
      ? { avatar_preset: participant.avatar_preset }
      : {}),
  };
}

function userParticipantWithProfile(
  participant: Participant,
  profile: UserProfile,
): Participant {
  const next = {
    ...participant,
    name: profile.name,
    color: profile.color,
  };
  if (profile.avatar_preset !== undefined) {
    next.avatar_preset = profile.avatar_preset;
  } else {
    delete next.avatar_preset;
  }
  return next;
}

export function overlayProfileOnUsers(
  participants: Record<string, Participant>,
  profile: UserProfile,
): Record<string, Participant> {
  return Object.fromEntries(
    Object.entries(participants).map(([id, participant]) => [
      id,
      participant.kind === NO_LOOSE_STRING_VALUES.user
        ? userParticipantWithProfile(participant, profile)
        : participant,
    ]),
  );
}

export function customColorPreview(
  hexInput: string,
  presetColors: string[] = PRESET_COLORS,
): string | null {
  if (!isHexColor(hexInput)) return null;
  const normalized = hexInput.toLowerCase();
  return presetColors.some((color) => color.toLowerCase() === normalized)
    ? null
    : hexInput;
}
