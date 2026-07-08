import type { IntegrationPreflightResponse } from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  blocked: "blocked",
  stale: "stale",
  missing: "missing",
} as const;

export function shouldLaunchFromPreflight(
  preflight: IntegrationPreflightResponse,
): boolean {
  if (!preflight.runtime.available) return false;
  if (preflight.mcp.status === NO_LOOSE_STRING_VALUES.blocked || preflight.mcp.status === NO_LOOSE_STRING_VALUES.stale) {
    return false;
  }
  if (preflight.mcp.status === NO_LOOSE_STRING_VALUES.missing) return false;
  if (preflight.hooks.status === NO_LOOSE_STRING_VALUES.blocked) return false;
  if (
    preflight.hooks.status === NO_LOOSE_STRING_VALUES.missing ||
    preflight.hooks.status === NO_LOOSE_STRING_VALUES.stale
  ) {
    return false;
  }
  return true;
}
