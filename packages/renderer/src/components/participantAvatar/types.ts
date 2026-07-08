import type { Participant } from "@f-mark/shared";

export type AvatarKind =
  | "human"
  | "claude"
  | "gpt"
  | "opencode"
  | "terminal";

export interface ParticipantAvatarInput {
  participantId?: string;
  participant?: Participant;
  kind?: Participant["kind"];
  name?: string;
  color?: string;
  runtimeId?: string | null;
}

export type AvatarSize = "sm" | "md" | "lg" | "xl";

export interface ParticipantAvatarProps extends ParticipantAvatarInput {
  size?: AvatarSize;
  className?: string;
  title?: string;
  active?: boolean;
  ariaHidden?: boolean;
  playAnimated?: boolean;
}

