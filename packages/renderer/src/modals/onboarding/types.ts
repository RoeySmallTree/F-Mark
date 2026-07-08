const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
} as const;

/* Shared types + small id helpers for the first-launch onboarding wizard. */

export type OnboardingStep =
  | "profile"
  | "theme"
  | "providers"
  | "folder"
  | "todos";

export const ONBOARDING_STEPS: {
  key: OnboardingStep;
  label: string;
  blurb: string;
}[] = [
  { key: "profile", label: "You", blurb: "Name & photo" },
  { key: "theme", label: "Theme", blurb: "Make it yours" },
  { key: "providers", label: "Providers", blurb: "Wire up your agents" },
  { key: "folder", label: "Project", blurb: "Where you'll work" },
  { key: "todos", label: "Kickoff", blurb: "Todos + first prompt" },
];

/** Identity minted for a managed agent: a stable participant id (reused for
    integration setup and spawn), a display name, and an accent color. */
export interface AgentIdentity {
  participantId: string;
  name: string;
  color: string;
}

/** The chosen runtime to launch as the first session's agent, plus its
    minted identity. Null until the user picks one in the Providers step. */
export interface ChosenAgent {
  runtimeId: string;
  identity: AgentIdentity;
  model?: string;
  effort?: string;
}

function randomHex(bytes: number): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return [...data]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  return Math.floor(Math.random() * 16 ** (bytes * 2))
    .toString(16)
    .padStart(bytes * 2, "0");
}

/** Mirror of useAgentSpawn's suggestedParticipantId so onboarding spawns land
    with the same id shape (`ag-<runtime>-<hex>`). */
export function genParticipantId(runtimeId: string): string {
  const safe = runtimeId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return `ag-${safe.length > 0 ? safe : NO_LOOSE_STRING_VALUES.agent}-${randomHex(2)}`;
}

export function genTodoId(): string {
  return `td-${randomHex(4)}`;
}
