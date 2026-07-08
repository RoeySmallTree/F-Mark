import { nsKey } from "./storageNamespace.js";

export function storageGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(nsKey(key)) ?? null;
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(nsKey(key), value);
  } catch {
    /* swallow - running in an env without localStorage */
  }
}

export function storageRemove(key: string): void {
  try {
    globalThis.localStorage?.removeItem(nsKey(key));
  } catch {
    /* swallow */
  }
}

export function saveJson(key: string, value: unknown): void {
  storageSet(key, JSON.stringify(value));
}

export function loadMap<T>(
  key: string,
  normalize: (value: unknown, key: string) => T | undefined,
): Record<string, T> {
  try {
    const raw = storageGet(key);
    if (raw === null || raw === undefined) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return {};
    const out: Record<string, T> = {};
    for (const [entryKey, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      const normalized = normalize(value, entryKey);
      if (normalized !== undefined) out[entryKey] = normalized;
    }
    return out;
  } catch {
    return {};
  }
}

export function loadStringMap(
  key: string,
  opts: { requireNonEmpty?: boolean } = {},
): Record<string, string> {
  return loadMap(key, (value) => {
    if (typeof value !== "string") return undefined;
    if (opts.requireNonEmpty === true && value.length === 0) {
      return undefined;
    }
    return value;
  });
}

export function loadNumberMap(key: string): Record<string, number> {
  return loadMap(key, (value) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined,
  );
}
