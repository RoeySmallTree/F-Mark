import type { CSSProperties, JSX } from "react";
import type { Participant } from "@f-mark/shared";

export type AvatarKind = "human" | "claude" | "gemini" | "gpt" | "terminal";

export interface ParticipantAvatarInput {
  participantId?: string;
  participant?: Participant;
  kind?: Participant["kind"];
  name?: string;
  color?: string;
  runtimeId?: string | null;
}

interface ParticipantAvatarProps extends ParticipantAvatarInput {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  title?: string;
  active?: boolean;
  ariaHidden?: boolean;
}

const ICON_BY_KIND: Record<AvatarKind, string> = {
  human: "/agent-icons/human-icon.png",
  claude: "/agent-icons/claude-icon.png",
  gemini: "/agent-icons/gemini-icon.png",
  gpt: "/agent-icons/gpt-icon.png",
  terminal: "/agent-icons/terminal-icon.png",
};

function normalizedName(input: ParticipantAvatarInput): string {
  return [
    input.name ?? input.participant?.name ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

export function avatarKind(input: ParticipantAvatarInput): AvatarKind {
  const participantKind = input.kind ?? input.participant?.kind;
  if (participantKind === "user" || input.participantId?.startsWith("us-")) {
    return "human";
  }

  const runtimeId = (input.runtimeId ?? input.participant?.runtime_id ?? "")
    .toLowerCase()
    .trim();
  if (runtimeId.includes("claude")) return "claude";
  if (runtimeId.includes("gemini")) return "gemini";
  if (
    runtimeId.includes("codex") ||
    runtimeId.includes("gpt") ||
    runtimeId.includes("openai") ||
    runtimeId.includes("chatgpt")
  ) {
    return "gpt";
  }
  if (runtimeId.length > 0) return "terminal";

  const name = normalizedName(input);
  if (name.includes("claude")) return "claude";
  if (name.includes("gemini")) return "gemini";
  if (
    name.includes("codex") ||
    name.includes("gpt") ||
    name.includes("openai") ||
    name.includes("chatgpt")
  ) {
    return "gpt";
  }
  return "terminal";
}

export function avatarIconSrc(kind: AvatarKind): string {
  return ICON_BY_KIND[kind];
}

function borderColor(input: ParticipantAvatarInput): string | undefined {
  return input.color ?? input.participant?.color;
}

export function ParticipantAvatar({
  participantId,
  participant,
  kind,
  name,
  color,
  runtimeId,
  size = "md",
  className,
  title,
  active = false,
  ariaHidden = true,
}: ParticipantAvatarProps): JSX.Element {
  const resolvedKind = avatarKind({
    participantId,
    participant,
    kind,
    name,
    color,
    runtimeId,
  });
  const classes = [
    "avatar",
    resolvedKind === "human" ? "user" : "agent",
    size !== "md" ? size : "",
    active ? "active" : "",
    "with-image",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const cssColor = borderColor({ participant, color });
  const style =
    cssColor !== undefined
      ? ({ "--avatar-color": cssColor } as CSSProperties)
      : undefined;
  const label =
    title ?? name ?? participant?.name ?? participantId ?? resolvedKind;

  return (
    <span
      className={classes}
      title={title}
      style={style}
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : label}
    >
      <img src={ICON_BY_KIND[resolvedKind]} alt="" draggable={false} />
    </span>
  );
}
