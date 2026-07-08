import {
  defaultRuntimeAccessMode,
  isRuntimeAccessMode,
} from "@f-mark/shared";

export function normalizeAccessMode(
  runtimeId: string | null,
  mode: string,
): string {
  if (isRuntimeAccessMode(runtimeId, mode)) return mode;
  return defaultRuntimeAccessMode(runtimeId);
}

export function resolveRequestedAccessMode(
  runtimeId: string,
  requestedAccessMode: unknown,
):
  | { ok: true; accessMode: string }
  | { ok: false; error: string } {
  if (
    requestedAccessMode !== undefined &&
    (typeof requestedAccessMode !== "string" ||
      requestedAccessMode.length === 0)
  ) {
    return { ok: false, error: "access_mode must be a non-empty string" };
  }

  const accessMode =
    requestedAccessMode !== undefined
      ? requestedAccessMode
      : defaultRuntimeAccessMode(runtimeId);
  if (accessMode !== "default" && !isRuntimeAccessMode(runtimeId, accessMode)) {
    return {
      ok: false,
      error: `unsupported access_mode for ${runtimeId}: ${accessMode}`,
    };
  }
  return { ok: true, accessMode };
}
