const NO_LOOSE_STRING_VALUES = {
  comfortable: "comfortable",
  density: "density-",
} as const;

/**
 * Density manager — mirrors `themes/index.ts`. Adds a body class
 * `density-compact|comfortable|spacious` and persists the choice to
 * localStorage so reloads keep the setting. Default is `'comfortable'`.
 */

export type DensityName = "compact" | "comfortable" | "spacious";

export const STORAGE_KEY = "fmark.density";

export const DENSITIES: {
  name: DensityName;
  label: string;
  description: string;
}[] = [
  {
    name: "compact",
    label: "Compact",
    description: "Tighter padding and gaps — fit more on screen.",
  },
  {
    name: "comfortable",
    label: "Comfortable",
    description: "Balanced spacing — the default.",
  },
  {
    name: "spacious",
    label: "Spacious",
    description: "Generous breathing room around each card.",
  },
];

const DENSITY_NAMES: DensityName[] = DENSITIES.map((d) => d.name);

const subscribers = new Set<(name: DensityName) => void>();

function isDensityName(value: unknown): value is DensityName {
  return (
    typeof value === "string" && DENSITY_NAMES.includes(value as DensityName)
  );
}

function safeStorageGet(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(value: string): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value);
  } catch {
    /* swallow */
  }
}

export function getCurrentDensity(): DensityName {
  const raw = safeStorageGet();
  return isDensityName(raw) ? raw : NO_LOOSE_STRING_VALUES.comfortable;
}

export function applyDensity(
  name: DensityName,
  opts: { persist?: boolean } = {},
): void {
  const body = globalThis.document?.body;
  if (body !== undefined) {
    const toRemove: string[] = [];
    body.classList.forEach((cls) => {
      if (cls.startsWith(NO_LOOSE_STRING_VALUES.density)) toRemove.push(cls);
    });
    for (const cls of toRemove) body.classList.remove(cls);
    body.classList.add(`density-${name}`);
  }
  if (opts.persist !== false) safeStorageSet(name);
  for (const cb of subscribers) {
    try {
      cb(name);
    } catch {
      /* swallow */
    }
  }
}

export function subscribeDensity(cb: (n: DensityName) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Live-apply density changes from OTHER tabs (X6). Mirrors
 *  `startThemeStorageSync`: re-apply without persisting, notify subscribers. */
let densityStorageListening = false;
export function startDensityStorageSync(): () => void {
  if (typeof window === "undefined") return () => {};
  if (densityStorageListening) return () => {};
  densityStorageListening = true;
  const onStorage = (e: StorageEvent): void => {
    if (e.key !== STORAGE_KEY) return;
    applyDensity(getCurrentDensity(), { persist: false });
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
    densityStorageListening = false;
  };
}
