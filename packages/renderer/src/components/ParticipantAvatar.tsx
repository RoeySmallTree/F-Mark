import type { CSSProperties, JSX } from "react";
import type { Participant } from "@f-mark/shared";

export type AvatarKind =
  | "human"
  | "claude"
  | "gpt"
  | "opencode"
  | "terminal";

/* Inline CSS custom property that carries the icon URL into a mask-based
   span. Using a mask lets the icon shape adopt the parent's `color` so it
   stays legible against any theme background — the source PNGs are
   white-on-transparent and were invisible against the default light
   canvas. */
export function iconMaskStyle(kind: AvatarKind): CSSProperties {
  return { "--icon-url": `url(${ICON_BY_KIND[kind]})` } as CSSProperties;
}

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
  gpt: "/agent-icons/gpt-icon.png",
  opencode: "/agent-icons/opencode-icon.svg",
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
  if (runtimeId.includes("opencode")) return "opencode";
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
  if (name.includes("opencode")) return "opencode";
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

function avatarImageUrl(
  input: ParticipantAvatarInput,
  resolvedKind: AvatarKind,
): string | undefined {
  if (resolvedKind !== "human") return undefined;
  return input.participant?.avatar_data_url;
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
  const imageUrl = avatarImageUrl(
    {
      participantId,
      participant,
      kind,
      name,
      color,
      runtimeId,
    },
    resolvedKind,
  );
  const classes = [
    "avatar",
    resolvedKind === "human" ? "user" : "agent",
    size !== "md" ? size : "",
    active ? "active" : "",
    "with-image",
    imageUrl !== undefined ? "with-custom-image" : "",
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
      {imageUrl !== undefined ? (
        <img className="avatar-img" src={imageUrl} alt="" draggable={false} />
      ) : (
        <span className="icon-mask" style={iconMaskStyle(resolvedKind)} />
      )}
    </span>
  );
}
