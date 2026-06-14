import type { CSSProperties } from "react";

/* Built-in runtime catalog. The full editable registry is available through
   /runtimes; this table gives built-ins stable labels for surfaces that only
   have an env-probe snapshot. */
export const KNOWN_RUNTIMES: Record<
  string,
  { displayName: string; executable: string }
> = {
  claude: { displayName: "Claude Code", executable: "claude" },
  codex: { displayName: "Codex", executable: "codex" },
  opencode: { displayName: "Opencode", executable: "opencode" },
};

export function runtimeDisplayName(runtimeId: string): string {
  return KNOWN_RUNTIMES[runtimeId]?.displayName ?? runtimeId;
}

export const RUNTIME_PROVIDER_ICONS = {
  claude: {
    kind: "claude",
    src: "/agent-icons/claude-icon.png",
    label: "Claude icon",
  },
  openai: {
    kind: "openai",
    src: "/agent-icons/gpt-icon.png",
    label: "OpenAI icon",
  },
  opencode: {
    kind: "opencode",
    src: "/agent-icons/opencode-icon.svg",
    label: "Opencode icon",
  },
} as const;

export type RuntimeProviderIconKind = keyof typeof RUNTIME_PROVIDER_ICONS;
export type RuntimeProviderIcon =
  (typeof RUNTIME_PROVIDER_ICONS)[RuntimeProviderIconKind];

export type RuntimeProviderVisual =
  | { type: "icon"; icon: RuntimeProviderIcon }
  | { type: "initials"; initials: string };

function normalizeProviderToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function runtimeProviderIconKind(
  runtimeId: string,
  displayName = runtimeId,
): RuntimeProviderIconKind | null {
  const haystack = `${normalizeProviderToken(runtimeId)} ${normalizeProviderToken(
    displayName,
  )}`;
  if (/\b(opencode|open code)\b/.test(haystack)) return "opencode";
  if (/\b(claude|anthropic)\b/.test(haystack)) return "claude";
  if (/\b(codex|openai|open ai|chatgpt|chat gpt|gpt)\b/.test(haystack)) {
    return "openai";
  }
  return null;
}

export function runtimeProviderInitials(
  runtimeId: string,
  displayName = runtimeId,
): string {
  const source = displayName.trim() || runtimeId.trim() || "Agent";
  const words = source.replace(/[_-]+/g, " ").match(/[A-Za-z0-9]+/g) ?? [];
  const raw =
    words.length >= 2
      ? `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`
      : (words[0] ?? source).slice(0, 2);
  return raw.toUpperCase().padEnd(2, "?").slice(0, 2);
}

export function runtimeProviderVisual(
  runtimeId: string,
  displayName = runtimeId,
): RuntimeProviderVisual {
  const iconKind = runtimeProviderIconKind(runtimeId, displayName);
  const icon =
    iconKind !== null ? RUNTIME_PROVIDER_ICONS[iconKind] : undefined;
  if (icon !== undefined) {
    return { type: "icon", icon };
  }
  return {
    type: "initials",
    initials: runtimeProviderInitials(runtimeId, displayName),
  };
}

export function runtimeProviderIconStyle(
  icon: RuntimeProviderIcon,
): CSSProperties {
  return { "--icon-url": `url(${icon.src})` } as CSSProperties;
}
