export function stringField(input: unknown, key: string): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function nonBlankString(value: string): string | undefined {
  return value.trim().length > 0 ? value : undefined;
}

export function objectField(
  input: unknown,
  key: string,
): Record<string, unknown> | null {
  if (input === null || typeof input !== "object") return null;
  const value = (input as Record<string, unknown>)[key];
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function pickStringField(
  input: Record<string, unknown>,
  keys: string[],
): string | undefined {
  const direct = pickDirectStringField(input, keys);
  if (direct !== undefined) return direct;
  const details = objectField(input, "details");
  return details === null ? undefined : pickDirectStringField(details, keys);
}

function pickDirectStringField(
  input: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const direct = stringField(input, key);
    if (direct !== undefined) return direct;
  }
  return undefined;
}

export function truncateString(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
