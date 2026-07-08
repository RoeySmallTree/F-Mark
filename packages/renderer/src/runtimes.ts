import type { CSSProperties } from "react";

const NO_LOOSE_STRING_VALUES = {
  claude: "claude",
  opencode: "opencode",
  openai: "openai",
  agent: "Agent",
  icon: "icon",
  initials: "initials",
} as const;

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
    label: "Claude icon",
  },
  openai: {
    kind: "openai",
    label: "OpenAI icon",
  },
  opencode: {
    kind: "opencode",
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
  if (/\b(opencode|open code)\b/.test(haystack)) return NO_LOOSE_STRING_VALUES.opencode;
  if (/\b(claude|anthropic)\b/.test(haystack)) return NO_LOOSE_STRING_VALUES.claude;
  if (/\b(codex|openai|open ai|chatgpt|chat gpt|gpt)\b/.test(haystack)) {
    return NO_LOOSE_STRING_VALUES.openai;
  }
  return null;
}

function runtimeProviderInitials(
  runtimeId: string,
  displayName = runtimeId,
): string {
  const source = displayName.trim() || runtimeId.trim() || NO_LOOSE_STRING_VALUES.agent;
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
    return { type: NO_LOOSE_STRING_VALUES.icon, icon };
  }
  return {
    type: NO_LOOSE_STRING_VALUES.initials,
    initials: runtimeProviderInitials(runtimeId, displayName),
  };
}
