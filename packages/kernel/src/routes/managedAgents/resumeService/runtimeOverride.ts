import type { RuntimeOverridePatch } from "@f-mark/shared";

export function runtimeOverrideForParticipant(
  participant:
    | { model_override?: string; effort_override?: string }
    | undefined,
): RuntimeOverridePatch | undefined {
  if (!participant?.model_override && !participant?.effort_override) {
    return undefined;
  }
  return {
    model: participant.model_override,
    effort: participant.effort_override,
  };
}
