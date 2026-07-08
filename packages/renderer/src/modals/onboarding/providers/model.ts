import type { StatusValue } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  installed: "installed",
  notRequired: "not_required",
  missing: "missing",
  stale: "stale",
  update: "Update",
} as const;

export function readyStatus(status: StatusValue): boolean {
  return status === NO_LOOSE_STRING_VALUES.installed || status === NO_LOOSE_STRING_VALUES.notRequired;
}

export function needsApply(status: StatusValue): boolean {
  return status === NO_LOOSE_STRING_VALUES.missing || status === NO_LOOSE_STRING_VALUES.stale;
}

export function providerActionLabel({
  applying,
  mcp,
  hooks,
}: {
  applying: boolean;
  mcp: StatusValue;
  hooks: StatusValue;
}): string {
  if (applying) return "Setting up...";
  return mcp === NO_LOOSE_STRING_VALUES.stale || hooks === NO_LOOSE_STRING_VALUES.stale ? NO_LOOSE_STRING_VALUES.update : "Set up";
}
