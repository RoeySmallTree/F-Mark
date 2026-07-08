import type { AvatarKind, ParticipantAvatarInput } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  user: "user",
  us: "us-",
  human: "human",
  terminal: "terminal",
} as const;

type KindRule = {
  kind: Exclude<AvatarKind, "human" | "terminal">;
  tokens: string[];
};

const PROVIDER_KIND_RULES: KindRule[] = [
  { kind: "claude", tokens: ["claude"] },
  { kind: "opencode", tokens: ["opencode"] },
  { kind: "gpt", tokens: ["codex", "gpt", "openai", "chatgpt"] },
];

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

function textKind(value: string): AvatarKind | undefined {
  return PROVIDER_KIND_RULES.find((rule) =>
    rule.tokens.some((token) => value.includes(token)),
  )?.kind;
}

function participantName(input: ParticipantAvatarInput): string {
  return normalizedText(input.name ?? input.participant?.name);
}

export function avatarKind(input: ParticipantAvatarInput): AvatarKind {
  const participantKind = input.kind ?? input.participant?.kind;
  if (participantKind === NO_LOOSE_STRING_VALUES.user || input.participantId?.startsWith(NO_LOOSE_STRING_VALUES.us)) {
    return NO_LOOSE_STRING_VALUES.human;
  }

  const runtimeKind = textKind(
    normalizedText(input.runtimeId ?? input.participant?.runtime_id),
  );
  if (runtimeKind !== undefined) return runtimeKind;
  // `whoOf` yields `runtimeId: null` for an agent with no runtime, so guard on
  // `!= null` (not `!== undefined`): a real-but-unrecognized runtime still maps
  // to "terminal", while no-runtime agents fall through to name resolution so a
  // "Claude"/"Codex" agent gets its provider icon instead of the generic one.
  if (input.runtimeId != null || input.participant?.runtime_id) {
    return NO_LOOSE_STRING_VALUES.terminal;
  }

  return textKind(participantName(input)) ?? NO_LOOSE_STRING_VALUES.terminal;
}

